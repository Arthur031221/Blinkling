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
  const rec = record("click_away", { suffix: "-324" });
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
    // (The finished answer then opens the card again, below.)
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
    await expect.poll(() => cardOpen(app), { timeout: 4000 }).toBe(true);
    rec.frame("done-opens-card");
    await page.waitForTimeout(600);
    clickAway(b);
    await expect.poll(() => cardOpen(app), { timeout: 3000 }).toBe(false);
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

test("a card that opened by itself, without focus, closes on a click on the background", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("click_away_unfocused", { suffix: "-324" });
  try {
    const b = await background(app);
    await reveal(page);
    await emit(app, { type: "blink-say", text: "This card opened by itself." });
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    const focused = await app.evaluate(() =>
      globalThis.blinklingTest.composer.isFocused(),
    );
    rec.frame(`card-open-focused-${focused}`);
    await page.waitForTimeout(800);
    clickAway(b);
    await expect.poll(() => cardOpen(app), { timeout: 3000 }).toBe(false);
    rec.frame("closed");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("a click inside Settings, or on its language list, does not close the card", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("click_in_settings", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    await app.evaluate(() => globalThis.blinklingTest.settings.open());
    await page.waitForTimeout(1200);
    const box = () =>
      app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes("/settings/index.html"),
        );
        return w.getBounds();
      });
    const win = await box();
    rec.frame("settings-open");
    // An empty spot of the panel, low down on its left.
    native([
      { type: "move", x: win.x + 30, y: win.y + win.height - 30, wait: 0.2 },
      { type: "down" },
      { type: "up", wait: 0.1 },
    ]);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250);
      expect(
        await cardOpen(app),
        "the card stays after a click in Settings",
      ).toBe(true);
    }
    rec.frame("after-click");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("a click on the background puts away the menu bubbles and the progress bubble and Blink retreats; the idle grumble is left alone", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("click_away_bubbles", { suffix: "-324", fps: 6 });
  try {
    const b = await background(app);
    const send = (event) =>
      app.evaluate((_e, event) => globalThis.blinklingTest.send(event), event);
    const shown = (id) => page.locator(id).getAttribute("data-shown");
    // The menu bubbles.
    await reveal(page);
    await expect.poll(() => machine(app).then((m) => m.state)).toBe("menu");
    rec.frame("menu");
    clickAway(b);
    await expect
      .poll(() => machine(app).then((m) => m.state), { timeout: 3000 })
      .not.toBe("menu");
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 3000,
    });
    rec.frame("menu-away");
    // The progress bubble beside Blink while a slow capture is under way.
    await reveal(page);
    await send({
      type: "capture-status",
      state: "working",
      message: "Reading the page",
    });
    await expect.poll(() => shown("#status")).toBe("true");
    rec.frame("progress");
    clickAway(b);
    await expect.poll(() => shown("#status"), { timeout: 3000 }).toBe("false");
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 3000,
    });
    // More progress from the same capture does not bring it back.
    await send({
      type: "capture-status",
      state: "working",
      message: "Still reading",
    });
    await page.waitForTimeout(600);
    expect(await shown("#status")).toBe("false");
    rec.frame("progress-away");
    await send({ type: "capture-status", state: "done" });
    // The idle grumble stays through a click on the background.
    await page.evaluate(() =>
      window.desktop.grumbler.touch(performance.now() - 61_000),
    );
    await expect.poll(() => shown("#grumble")).toBe("true");
    await page.waitForTimeout(800);
    rec.frame("grumble");
    clickAway(b);
    await page.waitForTimeout(900);
    expect(await shown("#grumble")).toBe("true");
    expect(await mode(page)).toBe("peek");
    rec.frame("grumble-stays");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("after a click inside Settings, and after Settings closes, a click on the background closes the card again", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("bgclick_after_settings", {
    suffix: "-324",
    also: ["recheck323_live"],
  });
  try {
    const b = await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    await app.evaluate(() => globalThis.blinklingTest.settings.open());
    await page.waitForTimeout(1200);
    const win = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("/settings/index.html"),
      );
      return w.getBounds();
    });
    native([
      { type: "move", x: win.x + 30, y: win.y + win.height - 30, wait: 0.2 },
      { type: "down" },
      { type: "up", wait: 0.1 },
    ]);
    await page.waitForTimeout(800);
    expect(await cardOpen(app), "stays after the click in Settings").toBe(true);
    rec.frame("settings-clicked");
    // A click on the background with Settings still open closes the card.
    clickAway(b);
    await expect.poll(() => cardOpen(app), { timeout: 3000 }).toBe(false);
    rec.frame("closed-by-background");
  } finally {
    await rec.stop();
    await app.close();
  }
});
