import { test, expect } from "@playwright/test";
import { launch, native, bodyBox } from "./support.mjs";
import { background, reveal, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardOpen = (app) =>
  app.evaluate(() => {
    const c = globalThis.blinklingTest.composer;
    return Boolean(c && c.isVisible());
  });
const emit = (app, event) =>
  app.evaluate(
    (_e, event) => globalThis.blinklingTest.session.emit(event),
    event,
  );
const clickAway = (b) =>
  native([
    { type: "move", x: b.x + 120, y: b.y + 160, wait: 0.2 },
    { type: "down" },
    { type: "up", wait: 0.1 },
  ]);
const machine = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
const mode = (page) => page.locator("#blink").getAttribute("data-mode");

test("a click on the background closes the card and Blink peeks, also while an answer streams on; a pinned card stays", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("click_away", { suffix: "-321" });
  try {
    const b = await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    await page.waitForTimeout(600);
    rec.frame("card-open");
    // A streaming answer is under way.
    await emit(app, {
      type: "delta",
      id: "a1",
      text: "First part of the answer. ",
    });
    await page.waitForTimeout(500);
    rec.frame("streaming");
    clickAway(b);
    await expect.poll(() => cardOpen(app), { timeout: 3000 }).toBe(false);
    // Blink goes back to its edge together with the card, not 1.5 s later.
    await page.waitForTimeout(250);
    expect(await machine(app), "one unit").toMatchObject({
      out: false,
      state: "peek",
      card: false,
    });
    rec.frame("closed");
    // The stream goes on; neither deltas nor the end bring the card back.
    for (let i = 0; i < 3; i++) {
      await emit(app, { type: "delta", id: "a1", text: `More text ${i}. ` });
      await page.waitForTimeout(400);
      expect(await cardOpen(app), "no reopen while streaming").toBe(false);
    }
    // Blink is back at its edge as one unit with the card, not held out.
    await expect
      .poll(
        () =>
          app.evaluate(() => globalThis.blinklingTest.blink.getBounds().width),
        { timeout: 6000 },
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(2200);
    expect(await mode(page), "Blink peeks").not.toBe("hover");
    const peeked = await bodyBox(page);
    rec.frame("peek");
    await emit(app, {
      type: "message",
      id: "a1",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "First part of the answer. More text 0. More text 1. More text 2.",
        },
      ],
    });
    await emit(app, { type: "done", id: "a1" });
    await page.waitForTimeout(1500);
    expect(await cardOpen(app), "the finished answer does not reopen").toBe(
      false,
    );
    rec.frame("done-closed");
    expect(peeked).toBeTruthy();
    // A pinned card ignores the click.
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    await page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: true }),
    );
    await page.waitForTimeout(400);
    clickAway(b);
    await page.waitForTimeout(1200);
    expect(await cardOpen(app), "pinned card stays").toBe(true);
    rec.frame("pinned-stays");
    // The next question opens the card again and the history holds the answer.
    await page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: false }),
    );
  } finally {
    await rec.stop();
    await app.close();
  }
});
