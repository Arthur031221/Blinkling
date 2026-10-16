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
async function chipPoint(app, text, scope = "body") {
  for (const page of app.windows()) {
    const button = page
      .locator(scope)
      .getByRole("button", { name: text, exact: true })
      .first();
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

// A paper, a page in Arabic, and a page made hard to operate on purpose (the
// W3C's "before" demonstration site).
const PAGES = {
  papers: "https://arxiv.org/abs/2501.12948",
  arabic: "https://ar.wikipedia.org/wiki/ذكاء_اصطناعي",
  hard: "https://www.w3.org/WAI/demos/bad/before/home.html",
};
const PAGE = PAGES[scene] ?? PAGES.papers;

const home = mkdtempSync(join(tmpdir(), "blinkling-rec-"));
// A neutral working folder: the session Blink starts inherits it, and the
// answers on screen should not name the repository the recording was made in.
const app = await electron.launch({
  cwd: home,
  args: [join(root, "desktop"), "--no-sandbox", "--lang=en-US"],
  env: {
    ...process.env,
    XDG_CONFIG_HOME: join(home, "config"),
    BLINKLING_E2E: "1",
    BLINKLING_LIVE: "1",
    BLINKLING_REMOTE: "0",
  },
});
// What the app says while it runs is kept beside the film, for finding out why
// a take went wrong.
const appLog = [];
for (const stream of [app.process().stdout, app.process().stderr])
  stream?.on("data", (chunk) => appLog.push(String(chunk)));
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
    "--disable-features=Translate,TranslateUI",
  ],
});
const context = await browser.newContext({ viewport: null, locale: "en-US" });
const page = await context.newPage();
await page.goto(PAGE, { waitUntil: "domcontentloaded" });
await wait(3000);
if (scene === "arabic") {
  // Chrome offers to translate a page in another language; the recording shows
  // Blink doing that, so the offer is closed before the film starts.
  input([["move", 1200, 104], ["press"], ["release"], ["move", 640, 700]]);
  await wait(800);
}

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

/** Where a paragraph of the page is on the screen: its middle, inside the part
 * that is visible. */
async function paragraphPoint(selector) {
  return page.evaluate((selector) => {
    const chrome = window.outerHeight - window.innerHeight;
    const node = [...document.querySelectorAll(selector)].find((p) => {
      const r = p.getBoundingClientRect();
      return (
        p.textContent.trim().length > 120 &&
        r.top > 40 &&
        r.bottom < innerHeight - 40 &&
        r.width > 300
      );
    });
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return {
      x: Math.round(window.screenX + r.right - Math.min(r.width / 2, 200)),
      y: Math.round(
        window.screenY + chrome + r.top + Math.min(r.height / 2, 40),
      ),
    };
  }, selector);
}
/** Screen position of an element in Blink's own window. */
async function blinkPoint(selector) {
  for (const w of app.windows()) {
    const at = await w
      .evaluate((selector) => {
        const node = document.querySelector(selector);
        if (!node || !window.desktop) return null;
        const r = node.getBoundingClientRect();
        return {
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
        };
      }, selector)
      .catch(() => null);
    if (at) return at;
  }
  return null;
}

const scenes = {
  async papers() {
    return this.pick();
  },
  async arabic() {
    await page.mouse.wheel(0, 300);
    await wait(1500);
    const at = await paragraphPoint("#mw-content-text p");
    if (!at) throw new Error("no paragraph on the Arabic page");
    input([["move", at.x - 30, at.y - 20]]);
    await wait(1200);
    mark("ctrl-down");
    input([["down", "ctrl"]]);
    await wait(600);
    input([["move", at.x, at.y]]);
    await wait(1200);
    mark("click");
    input([["press"], ["release"]]);
    await wait(600);
    input([["up", "ctrl"]]);
    await wait(4000);
    mark("composer");
    // The Translate chip sends exactly "Translate"; the answer says what the
    // Arabic passage means in English.
    const chip = await chipPoint(app, "Translate");
    input([["move", chip.x, chip.y]]);
    await wait(800);
    mark("ask");
    input([["press"], ["release"]]);
    await wait(14000);
    mark("answer");
    await wait(3000);
  },
  async hard() {
    const body = await blinkPoint(".blink-body");
    if (!body) throw new Error("no Blink");
    input([["move", 640, 400]]);
    await wait(1200);
    mark("blink");
    input([["move", body.x + 60, body.y]]);
    await wait(1800);
    input([["move", body.x, body.y]]);
    await wait(1800);
    mark("menu");
    const guide = await blinkPoint('[data-action="guide"]');
    if (!guide) throw new Error("no guide bubble");
    input([["move", guide.x, guide.y]]);
    await wait(900);
    mark("guide");
    input([["press"], ["release"]]);
    // The overview is up once the Start button is in the card.
    let start;
    for (let i = 0; i < 60 && !start; i++) {
      await wait(1000);
      start = await chipPoint(app, "Start", ".gl-guide").catch(() => null);
    }
    if (!start) throw new Error("the guide never offered Start");
    mark("answer");
    await wait(4500);
    start = await chipPoint(app, "Start", ".gl-guide");
    input([["move", start.x, start.y]]);
    await wait(900);
    mark("start");
    input([["press"], ["release"]]);
    await wait(3500);
    for (const n of [1, 2]) {
      const next = await chipPoint(app, "Next", ".gl-guide");
      input([["move", next.x, next.y]]);
      await wait(700);
      mark(`next-${n}`);
      input([["press"], ["release"]]);
      await wait(3500);
    }
  },
  async pick() {
    input([["move", 500, 560]]);
    await wait(1200);
    mark("ctrl-down");
    input([["down", "ctrl"]]);
    await wait(600);
    input([["move", 520, 575]]);
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
    await wait(14000);
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
          c === " "
            ? "space"
            : c === "?"
              ? "question"
              : c === ","
                ? "comma"
                : c,
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
    type("what is reinforcement learning, in two lines");
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
writeFileSync(join(out, `${scene}.app.log`), appLog.join(""));
await browser.close();
await app.close();
