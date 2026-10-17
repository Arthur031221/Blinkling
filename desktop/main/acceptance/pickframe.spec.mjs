import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, shot, rgb, sleep } from "./helpers.mjs";
import x11 from "x11";
import {
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { record, r3 } from "./record.mjs";
import { effectPlan } from "../../pick/effects.mjs";

const AREA = { x: 300, y: 200, width: 400, height: 260 };

const PHOTO = `<body style="margin:0;background:linear-gradient(120deg,#2b5876,#e9b44c 45%,#c0392b 70%,#1b1f3b)"><div style="position:fixed;inset:0;background:repeating-radial-gradient(circle at 30% 40%,rgba(255,255,255,.25) 0 7px,rgba(0,0,0,.25) 7px 15px)"></div>`;
const PAGES = {
  light: `<body style="margin:0;background:#f6f6f2;color:#222;font:24px sans-serif"><div style="padding:40px">A light page</div>`,
  dark: `<body style="margin:0;background:#14161a;color:#ddd;font:24px sans-serif"><div style="padding:40px">A dark page</div>`,
  photo: PHOTO,
};

const paint = (app, name) =>
  app.evaluate(async (_, html) => {
    await globalThis.bg.loadURL("data:text/html," + encodeURIComponent(html));
  }, PAGES[name]);

/** The layer is an override-redirect window on X11 and the page window was made
 * after it, so it is raised the way the shell raises it for a real pick. */
const raise = (id) =>
  new Promise((done, fail) =>
    x11.createClient((error, display) => {
      if (error) return fail(error);
      display.client.RaiseWindow(id);
      display.client.terminate();
      done();
    }),
  );

/** Shows the pick layer and hands it what the controller sends for a taken area. */
const take = async (app, bounds) => {
  const id = await app.evaluate(
    async ({ BrowserWindow, screen }, [bounds, effect]) => {
      const layer = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().endsWith("layer.html"),
      );
      const display = screen.getPrimaryDisplay();
      layer.setBounds(display.bounds);
      layer.showInactive();
      layer.webContents.send("blinkling:pick-message", {
        channel: "taken",
        value: {
          index: 0,
          kind: "area",
          bounds,
          effect,
          grew: false,
        },
      });
      return layer.getNativeWindowHandle().readUInt32LE(0);
    },
    [bounds, effectPlan({ kind: "area", bounds })],
  );
  await raise(id);
};

const column = (png, x, from, to) => {
  const out = [];
  for (let y = from; y <= to; y++) out.push(rgb(png, x, y));
  return out;
};
const greenish = ([r, g, b]) => g > r + 40 && g > b + 15;

test("the pick frame is exact: dark hairline, two rows of green, light hairline, on every page", async () => {
  test.setTimeout(120000);
  const { app } = await launch();
  const rec = record("pick_frame", { suffix: "-324" });
  try {
    await background(app);
    for (const name of ["light", "dark", "photo"]) {
      await paint(app, name);
      await sleep(400);
      rec.frame(`${name}-empty`);
      await take(app, AREA);
      await sleep(350);
      rec.frame(`${name}-ignite`, "560:400:200:100");
      await sleep(1500);
      const png = await shot(app, `pick-frame-${name}`);
      rec.frame(`${name}-calm`);
      rec.frame(
        `${name}-calm-x2`,
        "280:200:280:180,scale=iw*2:ih*2:flags=neighbor",
      );
      // Along the top edge the same four rows show on any page: the page itself,
      // a dark hairline, two rows of green on the edge, a light hairline. The light
      // running round may cover a stretch, so a few columns are tried.
      const lum = ([r, g, b]) => r + g + b;
      let found = 0;
      for (const x of [380, 420, 460, 500, 540, 580, 620]) {
        const rows = column(png, x, AREA.y - 4, AREA.y + 3);
        const green = rows.map(greenish);
        if (
          green.join() === "false,false,false,true,true,false,false,false" &&
          lum(rows[2]) < lum(rows[0]) - 9 &&
          lum(rows[5]) > lum(rows[0]) + 9
        )
          found++;
      }
      expect
        .soft(found, `${name}: two green rows on the top edge`)
        .toBeGreaterThanOrEqual(3);
      // The left edge is straight too: same two rows at the same x on every y.
      const xs = new Set();
      for (let y = AREA.y + 40; y < AREA.y + AREA.height - 40; y += 20) {
        const row = Array.from({ length: 9 }, (_, i) =>
          rgb(png, AREA.x - 4 + i, y),
        );
        xs.add(row.map(greenish).join());
      }
      expect
        .soft(xs.size, `${name}: the left edge does not wobble`)
        .toBeLessThanOrEqual(3);
      await app.evaluate(({ BrowserWindow }) => {
        const layer = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().endsWith("layer.html"),
        );
        layer.webContents.send("blinkling:pick-message", {
          channel: "clear",
          value: {},
        });
      });
      await sleep(300);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});

/** Real pixels of the running light: a lossless grab of the frame while it
 * runs, then the place on the edge that differs most from that place's usual
 * look, frame by frame. */
// The light's core is white on a dark system theme and a deeper green on a
// light one: the head must read on a page of its own theme either way.
for (const theme of ["dark", "light"])
  test(`the running light goes clockwise round the real frame at a steady 500 px a second on a ${theme} page`, async () => {
    test.setTimeout(120000);
    const { app } = await launch({ theme });
    const tag = theme === "dark" ? "" : "_page";
    await app
      .windows()
      .find((w) => w.url().endsWith("layer.html"))
      .emulateMedia({ colorScheme: theme });
    const FPS = 30;
    const MARGIN = 12;
    try {
      await background(app);
      await paint(app, theme);
      await sleep(400);
      await take(app, AREA);
      // Past the ignition, into the calm lap.
      await sleep(1500);
      const work = mkdtempSync(join(tmpdir(), "blinkling-light-"));
      // Every frame keeps the time it was really grabbed at, so a frame the
      // machine dropped or doubled under load is not read as the light jumping.
      const grabbed = spawnSync(
        "ffmpeg",
        [
          "-v",
          "info",
          "-y",
          "-f",
          "x11grab",
          "-framerate",
          String(FPS),
          "-video_size",
          `${AREA.width + 2 * MARGIN}x${AREA.height + 2 * MARGIN}`,
          "-i",
          `${process.env.DISPLAY}+${AREA.x - MARGIN},${AREA.y - MARGIN}`,
          "-t",
          "3.6",
          "-fps_mode",
          "passthrough",
          "-vf",
          "showinfo",
          join(work, "%04d.png"),
        ],
        { encoding: "utf8" },
      );
      const stamps = [...grabbed.stderr.matchAll(/pts_time:\s*([\d.]+)/g)].map(
        (m) => Number(m[1]),
      );
      mkdirSync(r3, { recursive: true });
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-framerate",
        String(FPS),
        "-i",
        join(work, "%04d.png"),
        "-vf",
        "fps=15,split[a][b];[a]palettegen[p];[b][p]paletteuse",
        join(r3, `pick_frame_light${tag}.gif`),
      ]);
      const frames = [];
      for (let n = 1; ; n++) {
        try {
          frames.push(
            PNG.sync.read(
              readFileSync(join(work, `${String(n).padStart(4, "0")}.png`)),
            ),
          );
        } catch {
          break;
        }
      }
      expect(frames.length).toBeGreaterThan(FPS * 3);
      expect(stamps.length).toBeGreaterThanOrEqual(frames.length);

      // Places on the edge, clockwise from the top left corner, every 2 px: the
      // sum of the four rows across the edge.
      const { width: w, height: h } = AREA;
      const total = 2 * (w + h);
      const at = (s) => {
        if (s < w) return [MARGIN + s, MARGIN, 0, 1];
        if (s < w + h) return [MARGIN + w, MARGIN + (s - w), 1, 0];
        if (s < 2 * w + h) return [MARGIN + w - (s - w - h), MARGIN + h, 0, 1];
        return [MARGIN, MARGIN + h - (s - 2 * w - h), 1, 0];
      };
      const places = [];
      for (let s = 12; s < total - 12; s += 2) places.push(s);
      const level = (png, s) => {
        const [x, y, nx, ny] = at(s);
        let sum = 0;
        for (let k = -2; k <= 1; k++) {
          const i = ((y + k * ny) * png.width + (x + k * nx)) * 4;
          sum += png.data[i] + png.data[i + 1] + png.data[i + 2];
        }
        return sum;
      };
      const levels = frames.map((png) => places.map((s) => level(png, s)));
      const usual = places.map((_, i) => {
        const column = levels.map((row) => row[i]).sort((a, b) => a - b);
        return column[column.length >> 1];
      });
      // The head is the place with the most light above its usual, with a small
      // window so one stray pixel is not taken for it.
      const head = levels.map((row) => {
        let best = 0,
          where = 0;
        for (let i = 4; i < row.length - 4; i++) {
          let sum = 0;
          for (let k = -4; k <= 4; k++)
            sum += Math.abs(row[i + k] - usual[i + k]);
          if (sum > best) {
            best = sum;
            where = i;
          }
        }
        return places[where];
      });
      // Unwrap the lap, then a straight line through it.
      const path = [head[0]];
      for (let i = 1; i < head.length; i++) {
        let step = head[i] - head[i - 1];
        if (step < -total / 2) step += total;
        if (step > total / 2) step -= total;
        path.push(path[i - 1] + step);
      }
      const n = path.length;
      const t = stamps.slice(0, n);
      const mt = t.reduce((a, b) => a + b) / n;
      const mp = path.reduce((a, b) => a + b) / n;
      const speed =
        t.reduce((a, v, i) => a + (v - mt) * (path[i] - mp), 0) /
        t.reduce((a, v) => a + (v - mt) ** 2, 0);
      // Along the sides: at a corner the four rows across the edge overlap and
      // the head cannot be told from the side it turns into, so the straight
      // stretches between the corners are measured.
      const corners = [0, w, w + h, 2 * w + h];
      const turning = (v) =>
        corners.some((c) => {
          const d = Math.abs((((v - c) % total) + total) % total);
          return Math.min(d, total - d) < 70;
        });
      const worst = Math.max(
        ...path.map((v, i) =>
          turning(v) ? 0 : Math.abs(v - (mp + speed * (t[i] - mt))),
        ),
      );
      writeFileSync(
        join(r3, `pick_frame_light${tag}.json`),
        JSON.stringify({
          frames: n,
          speed: +speed.toFixed(1),
          worst: +worst.toFixed(1),
        }),
      );
      // Clockwise, at the lap the frame is meant to have, and without a jump.
      expect(speed).toBeGreaterThan(430);
      expect(speed).toBeLessThan(570);
      expect(worst).toBeLessThan(16);
    } finally {
      await app.close();
    }
  });

for (const theme of ["dark", "light"])
  test(`while it ignites the frame is at full strength behind the streak and 35% ahead of it, and the core reads on a ${theme} page`, async () => {
    test.setTimeout(60000);
    const { app } = await launch({ theme });
    const FPS = 30;
    const MARGIN = 12;
    try {
      await app
        .windows()
        .find((w) => w.url().endsWith("layer.html"))
        .emulateMedia({ colorScheme: theme });
      await background(app);
      await paint(app, theme);
      await sleep(400);
      const work = mkdtempSync(join(tmpdir(), "blinkling-ignite-"));
      const grab = spawn(
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
          `${AREA.width + 2 * MARGIN}x${AREA.height + 2 * MARGIN}`,
          "-i",
          `${process.env.DISPLAY}+${AREA.x - MARGIN},${AREA.y - MARGIN}`,
          "-t",
          "2",
          join(work, "%04d.png"),
        ],
        { stdio: "inherit" },
      );
      await sleep(400);
      await take(app, AREA);
      await new Promise((done) => grab.on("close", done));
      const frames = readdirSync(work)
        .sort()
        .map((f) => PNG.sync.read(readFileSync(join(work, f))));
      const ground = rgb(frames[0], 40, 40);
      const far = (p, x, y) => {
        const c = rgb(p, x, y);
        return (
          Math.abs(c[0] - ground[0]) +
          Math.abs(c[1] - ground[1]) +
          Math.abs(c[2] - ground[2])
        );
      };
      // The middle of each side, on the green row.
      const sides = [
        [MARGIN + AREA.width / 2, MARGIN],
        [MARGIN + AREA.width, MARGIN + AREA.height / 2],
        [MARGIN + AREA.width / 2, MARGIN + AREA.height],
        [MARGIN, MARGIN + AREA.height / 2],
      ];
      const strength = frames.map((p) =>
        sides.map(([x, y]) =>
          Math.max(far(p, x, y), far(p, x - 1, y - 1), far(p, x, y - 1)),
        ),
      );
      const settled = Math.max(...strength.at(-1));
      // At some frame a side the streak has reached is at full strength while a
      // side ahead of it holds only the first 35%.
      const both = strength.some(
        (row) =>
          Math.max(...row) > settled * 0.95 &&
          Math.min(...row) > settled * 0.25 &&
          Math.min(...row) < settled * 0.45,
      );
      expect(both).toBe(true);
      // The head: the strongest edge pixel of the lap is darker than the white page
      // behind it on a light theme and brighter on a dark one, never the same as the line.
      let head = 0;
      for (const p of frames.slice(-25))
        for (let x = MARGIN; x < p.width - MARGIN; x++)
          head = Math.max(head, far(p, x, MARGIN - 1), far(p, x, MARGIN));
      expect(head).toBeGreaterThan(settled * 1.08);
    } finally {
      await app.close();
    }
  });

const layerEval = (app, code) =>
  app.evaluate(
    ({ BrowserWindow }, code) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith("layer.html"))
        .webContents.executeJavaScript(code),
    code,
  );

const percentile = (list, q) =>
  [...list].sort((a, b) => a - b)[
    Math.min(list.length - 1, Math.floor(list.length * q))
  ];

test("the frame is cheap to draw: its running light stays far inside a frame budget", async () => {
  test.setTimeout(120000);
  const { app } = await launch();
  try {
    await background(app);
    await paint(app, "photo");
    // Time every animation frame callback of the layer, and the gap between them.
    await layerEval(
      app,
      `window.__cost = { work: [], gap: [] };
       const raf = window.requestAnimationFrame.bind(window);
       let prev = 0;
       window.requestAnimationFrame = (fn) =>
         raf((now) => {
           if (prev) window.__cost.gap.push(now - prev);
           prev = now;
           const t = performance.now();
           fn(now);
           window.__cost.work.push(performance.now() - t);
         });
       true`,
    );
    const size = await app.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().bounds,
    );
    const result = {};
    for (const [name, bounds] of [
      ["area", AREA],
      ["screen", { x: 0, y: 0, width: size.width, height: size.height }],
    ]) {
      await take(app, bounds);
      await sleep(400);
      await layerEval(
        app,
        "window.__cost.work.length = 0; window.__cost.gap.length = 0; true",
      );
      await sleep(4000);
      const { work, gap } = await layerEval(app, "window.__cost");
      result[name] = {
        frames: work.length,
        work_p95_ms: +percentile(work, 0.95).toFixed(3),
        work_max_ms: +Math.max(...work).toFixed(3),
        gap_p95_ms: +percentile(gap, 0.95).toFixed(2),
        gap_max_ms: +Math.max(...gap).toFixed(2),
      };
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().endsWith("layer.html"))
          .webContents.send("blinkling:pick-message", {
            channel: "clear",
            value: {},
          });
      });
      await sleep(300);
    }
    mkdirSync(r3, { recursive: true });
    writeFileSync(
      `${r3}/perf-pick-frame.json`,
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log("PERF " + JSON.stringify(result));
    for (const r of Object.values(result)) {
      expect(r.frames).toBeGreaterThan(30);
      expect(r.work_p95_ms).toBeLessThan(4);
      expect(r.work_max_ms).toBeLessThan(16);
    }
  } finally {
    await app.close();
  }
});
