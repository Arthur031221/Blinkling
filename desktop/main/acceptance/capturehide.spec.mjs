import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal, clickBlink } from "./helpers.mjs";
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
    const rec = record(`capture_hide_${mode}`, { fps: 30, suffix: "-324" });
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

/** A read of the real screen, taken inside the guard with Blink and the card up:
 * how many pixels are not the page behind. Blink hidden for fewer frames than
 * the compositor needs would show here as pixels of Blink or the card. */
const leaks = (app, frames) =>
  app.evaluate(async ({ desktopCapturer, screen }, frames) => {
    const t = globalThis.blinklingTest,
      c = t.features.capture,
      d = screen.getPrimaryDisplay();
    if (frames) {
      const wait = (n) => new Promise((r) => setTimeout(r, n * 17));
      c.guard.settle = () => wait(frames);
    }
    const size = {
      width: d.bounds.width * d.scaleFactor,
      height: d.bounds.height * d.scaleFactor,
    };
    return c.guard.run(async () => {
      const [source] = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: size,
      });
      const { width, height } = source.thumbnail.getSize();
      const bits = source.thumbnail.toBitmap();
      let off = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          // The page's own line of text is not a leak.
          if (y < 110 && x < 420) continue;
          const i = (y * width + x) * 4;
          // Bitmap order is B, G, R, A: the page is #204080.
          if (
            Math.abs(bits[i] - 0x80) > 6 ||
            Math.abs(bits[i + 1] - 0x40) > 6 ||
            Math.abs(bits[i + 2] - 0x20) > 6
          )
            off++;
        }
      return off;
    });
  }, frames);

test("a read taken after the settle frames of this system has neither Blink nor the card in it", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch({
    env: { BLINKLING_CAPTURE_EXCLUDE: "0" },
  });
  const rec = record("capture_hide_clean", { fps: 30, suffix: "-324" });
  try {
    await background(app);
    await app.evaluate(() =>
      globalThis.blinklingTest.features.setSession({
        subscribe: () => () => {},
        send: async () => {},
        stop: async () => {},
      }),
    );
    await page.waitForTimeout(800);
    await reveal(page);
    await clickBlink(page);
    await page.waitForTimeout(900);
    const found = {};
    for (const n of [0, 1, 2, 3, 4, 8]) {
      found[n] = await leaks(app, n || undefined);
      await page.waitForTimeout(500);
    }
    console.log("settle frames -> pixels of Blink or the card", found);
    // What the app uses reads the same as a long wait does, with the card open
    // (what is left on the screen besides is the same in every read).
    const used = await leaks(app, null);
    console.log("as shipped:", used);
    expect(used, "nothing of Blink or the card in the read").toBe(found[8]);
    // Two frames still show Blink, three usually do not and sometimes do (the
    // compositor's timing), four never did: the shipped number is the first
    // one that is always clean.
    expect(found[2], "two frames are not enough").toBeGreaterThan(found[8]);
    expect(found[4], "the shipped number of frames is clean").toBe(found[8]);
  } finally {
    await rec.stop();
    await app.close();
  }
});
