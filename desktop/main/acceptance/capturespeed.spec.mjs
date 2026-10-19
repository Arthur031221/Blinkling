import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background } from "./helpers.mjs";
import { record } from "./record.mjs";

/** Times, in the main process, of the three steps of a capture: the picture
 * is handed to Blink, Blink has eaten it, and the card shows. */
test("a capture goes from the hotkey to the open card quickly, in the same order", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("r7_capture_speed", { fps: 30, suffix: "-327" });
  try {
    await background(app);
    await app.evaluate(({ screen }) => {
      const t = globalThis.blinklingTest,
        c = t.features.capture,
        b = screen.getPrimaryDisplay().bounds,
        log = (globalThis.speedLog = {
          start: null,
          delivered: null,
          card: null,
        });
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
      const deliver = c.onCapture;
      c.onCapture = async (...args) => {
        log.delivered = Date.now();
        return deliver(...args);
      };
      setInterval(() => {
        if (log.card === null && t.composer.isVisible()) log.card = Date.now();
      }, 5);
    });
    await page.waitForTimeout(800);
    await app.evaluate(() => {
      globalThis.speedLog.start = Date.now();
      void globalThis.blinklingTest.features.select();
    });
    await expect
      .poll(() => app.evaluate(() => globalThis.speedLog.card), {
        timeout: 20000,
      })
      .not.toBeNull();
    const { start, delivered, card } = await app.evaluate(
      () => globalThis.speedLog,
    );
    const times = {
      capture_ms: delivered - start,
      eat_ms: card - delivered,
      total_ms: card - start,
    };
    console.log(`CAPTURE_TIMES ${JSON.stringify(times)}`);
    expect(times.total_ms, "from the hotkey to the open card").toBeLessThan(
      2600,
    );
    expect(delivered, "the picture is handed over first").toBeGreaterThan(
      start,
    );
    expect(card, "the card opens after the picture is in").toBeGreaterThan(
      delivered,
    );
    await page.waitForTimeout(500);
    await rec.stop();
  } finally {
    await app.close();
  }
});
