import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { launch } from "./support.mjs";
import { background } from "./helpers.mjs";
import { r3 } from "./record.mjs";

const FPS = 30;
const SIZE = { width: 360, height: 240 };
const REGION = { x: 300, y: 160, ...SIZE };
// Four colours no part of Blink or the backdrop uses, one per quarter.
const QUARTERS = [
  { name: "tl", rgb: [255, 0, 0] },
  { name: "tr", rgb: [255, 220, 0] },
  { name: "bl", rgb: [255, 0, 255] },
  { name: "br", rgb: [255, 128, 0] },
];

/** A picture whose quarters are told apart by colour, so a screenshot of the
 * desktop shows which pixels of the capture are where. */
const capturePng = ({ width, height }) => {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const q = QUARTERS[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)];
      png.data.set([...q.rgb, 255], (y * width + x) * 4);
    }
  return PNG.sync.write(png).toString("base64");
};

const place = (app, edge, ratio) =>
  app.evaluate(
    async ({ screen }, [edge, ratio]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    [edge, ratio],
  );

/** Lossless x11grab of the display for the length of one capture. */
function grab(work) {
  const size = /dimensions:\s+(\d+x\d+)/.exec(
    execFileSync("xdpyinfo", [], { encoding: "utf8" }),
  )[1];
  const video = join(work, "run.mkv");
  const run = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-f",
      "x11grab",
      "-framerate",
      String(FPS),
      "-video_size",
      size,
      "-i",
      process.env.DISPLAY,
      "-c:v",
      "ffv1",
      video,
    ],
    { stdio: ["pipe", "ignore", "inherit"] },
  );
  return {
    video,
    async stop() {
      run.stdin.write("q");
      await new Promise((done) => run.on("close", done));
    },
  };
}

function frames(video, work) {
  const dir = join(work, "frames");
  mkdirSync(dir, { recursive: true });
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    video,
    join(dir, "%04d.png"),
  ]);
  return readdirSync(dir)
    .sort()
    .map((f) => PNG.sync.read(readFileSync(join(dir, f))));
}

const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 24);

/** Where the capture's own pixels are in a frame: one box and one centre per
 * quarter colour. */
function scan(png) {
  const found = QUARTERS.map((q) => ({ name: q.name, n: 0, sx: 0, sy: 0 }));
  let minX = Infinity,
    minY = Infinity,
    maxX = -1,
    maxY = -1,
    count = 0,
    paper = 0;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      // The card's paper: near white and a whole area of it, never the thin
      // text of the desktop fixture.
      if (png.data[i] > 225 && png.data[i + 1] > 225 && png.data[i + 2] > 215)
        paper++;
      const px = [png.data[i], png.data[i + 1], png.data[i + 2]];
      const k = QUARTERS.findIndex((q) => near(px, q.rgb));
      if (k < 0) continue;
      found[k].n++;
      found[k].sx += x;
      found[k].sy += y;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  const centre = (f) => f.n && { x: f.sx / f.n, y: f.sy / f.n };
  return {
    count,
    paper,
    box: count && { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    centre: Object.fromEntries(found.map((f) => [f.name, centre(f)])),
    mean: count && {
      x: found.reduce((s, f) => s + f.sx, 0) / count,
      y: found.reduce((s, f) => s + f.sy, 0) / count,
    },
  };
}

/** Delivers a capture of `region` and returns what the desktop showed, frame by
 * frame, from the moment the capture is attached. */
async function eat(app, region, label, tiles = 0) {
  const work = join(tmpdir(), `eat-${label}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const recording = grab(work);
  await new Promise((r) => setTimeout(r, 600));
  const png = capturePng(region);
  const delivered = app.evaluate(
    async ({ screen }, [png, region, tiles]) => {
      const d = screen.getPrimaryDisplay();
      const tile = (id) => ({
        image: { id, name: `${id}.png`, mediaType: "image/png", data: png },
        display: d,
        region,
      });
      await globalThis.blinklingTest.attachCapture({
        ...tile("eat-test"),
        ...(tiles
          ? { rest: Array.from({ length: tiles }, (_, i) => tile(`tile-${i}`)) }
          : {}),
      });
    },
    [png, region, tiles],
  );
  await delivered;
  const mouth = await app.evaluate(() => globalThis.blinklingTest.mouth());
  // Long enough for the card, which a busy machine opens late, to be seen.
  await new Promise((r) => setTimeout(r, 1600));
  await recording.stop();
  mkdirSync(r3, { recursive: true });
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    recording.video,
    "-vf",
    "fps=15,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
    join(r3, `eat_edges-324-${label}.gif`),
  ]);
  return { mouth, scans: frames(recording.video, work).map(scan), work };
}

const CASES = [
  ["region", REGION, 0],
  ["fullscreen", { x: 0, y: 0, width: 1280, height: 800 }, 0],
  // A page from the browser helper: tiles that fly as one, from the browser's
  // window rectangle.
  ["fullpage", { x: 120, y: 80, width: 900, height: 640 }, 2],
];
for (const edge of ["bottom", "left", "right"])
  for (const [label, region, tiles] of CASES)
    test(`a ${label} capture's own pixels fly into Blink's mouth at the ${edge} edge`, async () => {
      test.setTimeout(180000);
      const { app } = await launch();
      try {
        await background(app);
        await place(app, edge, 0.5);
        await new Promise((r) => setTimeout(r, 1500));
        const { mouth, scans } = await eat(
          app,
          region,
          `${label}_${edge}`,
          tiles,
        );
        // The flight is the first unbroken run of frames showing the picture; the
        // chip that appears in the composer afterwards carries the same colours.
        const start = scans.findIndex((s) => s.count > 40);
        expect(start, "the capture is seen flying").toBeGreaterThanOrEqual(0);
        let end = start;
        while (end + 1 < scans.length && scans[end + 1].count >= 5) end++;
        const shown = scans
          .slice(start, end + 1)
          .map((s, index) => ({ ...s, index: start + index }));
        expect(shown.length, "frames showing the capture").toBeGreaterThan(8);
        // It starts as the picture itself, full size, exactly where it was taken.
        const first = shown[0];
        expect(Math.abs(first.box.x - region.x)).toBeLessThan(30);
        expect(Math.abs(first.box.y - region.y)).toBeLessThan(30);
        expect(first.box.width).toBeGreaterThan(region.width - 40);
        expect(first.box.height).toBeGreaterThan(region.height - 40);
        // Nothing of it is cut away at the start: all four quarters are there and
        // most of its pixels show (Blink and the box may cover a little).
        expect(first.count).toBeGreaterThan(region.width * region.height * 0.8);
        for (const q of QUARTERS) expect(first.centre[q.name]).toBeTruthy();
        expect(first.centre.tl.x).toBeLessThan(first.centre.tr.x);
        expect(first.centre.tl.y).toBeLessThan(first.centre.bl.y);
        // It ends inside the mouth: the last pixels of it are within reach of it.
        const last = shown.at(-1);
        expect(
          Math.hypot(last.mean.x - mouth.x, last.mean.y - mouth.y),
        ).toBeLessThan(60);
        // The card comes after the picture is in: no card paper while it flies,
        // and the card is there once it has gone in (the box a capture opens).
        const cardAt = scans.findIndex((s) => s.paper > 12000);
        console.log(JSON.stringify({ flightEnd: end, cardAt, edge, label }));
        expect(cardAt, "the card opens after the eat").toBeGreaterThan(end - 1);
        // Nothing of it is left once it has gone in.
        expect(
          scans
            .slice(end + 1, Math.min(end + 5, cardAt))
            .every((s) => s.count < 5),
        ).toBe(true);
        // The neck of a genie swells a little as the leading end runs ahead; the
        // picture is never bigger than half as much again.
        const area = shown.map((s) => s.count);
        expect(Math.max(...area.slice(2))).toBeLessThanOrEqual(
          Math.max(...area.slice(0, 3)) * 1.5,
        );
        console.log(
          JSON.stringify({
            edge,
            label,
            mouth,
            first: first.box,
            last: last.mean,
            frames: shown.length,
          }),
        );
      } finally {
        await app.close();
      }
    });
