// Drives the real Blinkling app and a real Chromium window with native X input
// while ffmpeg grabs the composited desktop. Writes raw.mkv and events.json.
import { _electron as electron, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { input, poll } from "../../desktop/pick/e2e/support.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const out = process.env.OUT_DIR;
const scene = process.env.SCENE;
const events = [];
const t0 = Date.now();
const mark = (name, extra = {}) => {
  events.push({ name, at: (Date.now() - t0) / 1000, ...extra });
  console.log(name);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Screen position of a button in one of the app's windows. */
async function chipPoint(app, text) {
  for (const page of app.windows()) {
    const button = page.getByRole("button", { name: text }).first();
    if (!(await button.isVisible().catch(() => false))) continue;
    const box = await button.boundingBox({ timeout: 2000 }).catch(() => null);
    if (!box) continue;
    const origin = await page.evaluate(() => ({
      x: window.screenX,
      y: window.screenY,
    }));
    return {
      x: Math.round(origin.x + box.x + box.width / 2),
      y: Math.round(origin.y + box.y + box.height / 2),
    };
  }
  throw new Error(`no ${text} button`);
}

const PAGE = "https://arxiv.org/abs/2501.12948";

const home = mkdtempSync(join(tmpdir(), "blinkling-rec-"));
const app = await electron.launch({
  args: [join(root, "desktop"), "--no-sandbox", "--lang=en-US"],
  env: {
    ...process.env,
    XDG_CONFIG_HOME: join(home, "config"),
    BLINKLING_E2E: "1",
    BLINKLING_LIVE: "1",
    BLINKLING_REMOTE: "0",
  },
});
await poll(
  () => app.evaluate(() => Boolean(globalThis.blinklingTest?.snapshot)),
  30000,
  "app",
);

const browser = await chromium.launch({
  headless: false,
  args: [
    "--no-sandbox",
    "--start-maximized",
    "--force-renderer-accessibility",
    "--lang=en-US",
  ],
});
const context = await browser.newContext({ viewport: null, locale: "en-US" });
const page = await context.newPage();
await page.goto(PAGE, { waitUntil: "domcontentloaded" });
await wait(3000);

const ffmpeg = spawn(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "x11grab",
    "-framerate",
    "25",
    "-draw_mouse",
    "1",
    "-video_size",
    "1280x800",
    "-i",
    process.env.DISPLAY,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "14",
    "-pix_fmt",
    "yuv420p",
    join(out, `${scene}.mkv`),
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
await wait(1000);
mark("start");

const scenes = {
  async pick() {
    input([["move", 500, 207]]);
    await wait(1200);
    mark("ctrl-down");
    input([["down", "ctrl"]]);
    await wait(600);
    input([["move", 520, 209]]);
    await wait(1200);
    mark("click");
    input([["press"], ["release"]]);
    await wait(600);
    input([["up", "ctrl"]]);
    await wait(4000);
    mark("composer");
    // The quick box offers "What is this?" as a chip; click it where it is.
    const chip = await chipPoint(app, "What is this");
    input([["move", chip.x, chip.y]]);
    await wait(800);
    mark("ask");
    input([["press"], ["release"]]);
    await wait(32000);
    mark("answer");
    await wait(3000);
  },
  async area() {
    input([["move", 300, 380]]);
    await wait(1200);
    input([["down", "ctrl"]]);
    await wait(900);
    mark("drag");
    input([["drag", 300, 380, 900, 540, 1400]]);
    await wait(700);
    mark("drawn");
    input([["up", "ctrl"]]);
    await wait(4000);
    mark("composer");
    await wait(2000);
  },
  async ask() {
    const type = (text) =>
      input(
        [...text].map((c) => [
          "key",
          c === " " ? "space" : c === "?" ? "question" : c,
        ]),
      );
    input([["move", 700, 450]]);
    await wait(1200);
    mark("blink");
    input([["move", 1268, 640]]);
    await wait(1800);
    input([["move", 1192, 632]]);
    await wait(700);
    input([["press"], ["release"]]);
    await wait(2500);
    mark("typing");
    type("where do i download the pdf?");
    await wait(1200);
    mark("send");
    input([["key", "enter"]]);
    await wait(45000);
    mark("answer");
  },
};
await scenes[scene]();
mark("end");
ffmpeg.stdin.write("q");
await new Promise((r) => ffmpeg.on("close", r));
writeFileSync(
  join(out, `${scene}.events.json`),
  JSON.stringify(events, null, 2),
);
await browser.close();
await app.close();
