import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background } from "./helpers.mjs";
import { record } from "./record.mjs";

/** Every frame of Blink's page, with how much of it is drawn. */
const watchBlink = (page) =>
  page.evaluate(() => {
    window.drawn = [];
    const f = () => {
      window.drawn.push([
        performance.timeOrigin + performance.now(),
        Number(getComputedStyle(document.documentElement).opacity),
      ]);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });

/** The longest run of frames in which Blink is more than half gone. */
const gaps = (frames, from) => {
  let longest = 0,
    start = null,
    count = 0,
    total = 0;
  for (const [t, o] of frames.filter(([t]) => t >= from)) {
    if (o < 0.5) {
      start ??= t;
      count++;
      total++;
    } else if (start !== null) {
      longest = Math.max(longest, t - start);
      start = null;
    }
  }
  return { longest, hiddenFrames: total, runs: count };
};

for (const [mode, env, label] of [
  [
    "excluded",
    { BLINKLING_CAPTURE_EXCLUDE: "1" },
    "where the system keeps Blink out of the read",
  ],
  [
    "hidden",
    { BLINKLING_CAPTURE_EXCLUDE: "0" },
    "where Blink has to be hidden for the read",
  ],
]) {
  test(`a capture ${label}: Blink is gone for no longer than the read, or not at all`, async () => {
    test.setTimeout(120000);
    const { app, page } = await launch({ env });
    const rec = record(`capture_hide_${mode}`, { fps: 30, suffix: "-323" });
    try {
      await background(app);
      await app.evaluate(({ screen }) => {
        const t = globalThis.blinklingTest,
          c = t.features.capture,
          b = screen.getPrimaryDisplay().bounds;
        t.features.setSession({
          subscribe: () => () => {},
          send: async () => {},
          stop: async () => {},
        });
        c.list = async () => [
          {
            id: "w1",
            title: "Docs - Google Chrome",
            bounds: { x: 0, y: 0, width: b.width, height: b.height },
          },
        ];
        c.companion = () => false;
        c.overlays.open = async () => ({ kind: "screen" });
        const run = c.guard.run.bind(c.guard),
          log = (globalThis.guardLog = []);
        c.guard.run = async (task, signal) => {
          const from = Date.now();
          try {
            return await run(task, signal);
          } finally {
            log.push([from, Date.now()]);
          }
        };
      });
      await page.waitForTimeout(800);
      await watchBlink(page);
      const started = Date.now();
      await app.evaluate(() => void globalThis.blinklingTest.features.select());
      await expect
        .poll(() => app.evaluate(() => globalThis.guardLog.length), {
          timeout: 15000,
        })
        .toBeGreaterThan(0);
      await page.waitForTimeout(1500);
      await rec.stop();
      const frames = await page.evaluate(() => window.drawn);
      const [from, to] = await app.evaluate(() => globalThis.guardLog[0]);
      const found = gaps(frames, started);
      console.log(
        mode,
        "guard ms",
        to - from,
        "longest gap ms",
        Math.round(found.longest),
        "hidden frames",
        found.hiddenFrames,
      );
      if (mode === "excluded")
        expect(found.hiddenFrames, "no frame without Blink").toBe(0);
      else
        expect(
          found.longest,
          "Blink is gone for the read and the settle frames, with no fade out before it",
        ).toBeLessThanOrEqual(300);
    } finally {
      await app.close();
    }
  });
}
