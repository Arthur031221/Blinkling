import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal, clickBlink, shot, rgb } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardOpen = (app) =>
  app.evaluate(() => {
    const c = globalThis.blinklingTest.composer;
    return Boolean(c && c.isVisible());
  });
const bounds = (app) =>
  app.evaluate(() => globalThis.blinklingTest.cardBounds());
const emit = (app, event) =>
  app.evaluate(
    (_e, event) => globalThis.blinklingTest.session.emit(event),
    event,
  );
const say = (app, id, role, text) =>
  emit(app, {
    type: "message",
    id,
    role,
    content: [{ type: "text", text }],
    replay: role === "history",
  });
const LONG =
  "A paragraph that says what the window shows, in a few plain sentences, long enough to take several lines of the card. ";

test("an empty card is short and grows with what it holds, bottom fixed; the history is there on every opening, newest in view", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("empty_card", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    await page.waitForTimeout(800);
    const empty = await bounds(app);
    rec.frame("empty");
    expect(empty.height, "an empty card is short").toBeLessThan(260);
    // It grows upward as messages arrive; the bottom stays where Blink is.
    let last = empty;
    for (let i = 0; i < 6; i++) {
      await say(app, `u${i}`, "user", `Question number ${i}?`);
      await say(app, `a${i}`, "assistant", LONG + LONG);
      await page.waitForTimeout(500);
      const now = await bounds(app);
      expect(now.height, `after ${i + 1} exchanges`).toBeGreaterThanOrEqual(
        last.height,
      );
      expect(now.y + now.height, "bottom fixed").toBe(empty.y + empty.height);
      last = now;
      if (i === 1) rec.frame("growing");
    }
    expect(last.height, "a full card stops at its most").toBeLessThanOrEqual(
      520,
    );
    expect(last.height).toBeGreaterThan(empty.height + 150);
    rec.frame("full");
    // Close it, say that a new capture chat began, open it again: the history
    // is there, scrolled to the newest.
    await app.evaluate(() => {
      const c = globalThis.blinklingTest.composer;
      c.webContents.send("blinkling:surface", { type: "new-chat" });
    });
    await app.evaluate(() =>
      globalThis.blinklingTest.nBlinkMenuFaces.openCard(),
    );
    await page.waitForTimeout(600);
    const shown = await cardPage(app).evaluate(() => {
      const h = document.querySelector(".gl-chat-history");
      return {
        messages: h.querySelectorAll(".gl-chat-message").length,
        atEnd: h.scrollHeight - h.clientHeight - h.scrollTop,
      };
    });
    expect(shown.messages, "the history is in the card").toBeGreaterThanOrEqual(
      12,
    );
    expect(shown.atEnd, "newest in view").toBeLessThan(40);
    rec.frame("reopened");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("the card fades out toward its top in both themes, and the pin and close stay readable", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("card_fade", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    for (let i = 0; i < 4; i++) {
      await say(app, `u${i}`, "user", `Question number ${i}?`);
      await say(app, `a${i}`, "assistant", LONG + LONG);
    }
    await page.waitForTimeout(900);
    const card = cardPage(app);
    for (const theme of ["light", "dark"]) {
      await card.emulateMedia({ colorScheme: theme });
      await card.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await card.waitForTimeout(500);
      const box = await bounds(app);
      const rect = await card.evaluate(() => {
        const r = document
          .querySelector(".gl-chat-card")
          .getBoundingClientRect();
        const pin = document
          .querySelector(".gl-card-header .gl-icon-button")
          .getBoundingClientRect();
        const brand = document
          .querySelector(".gl-card-header .gl-brand")
          .getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          pin: { x: pin.x + 4, y: pin.y + 4 },
          list: document.querySelector(".gl-chat-history").offsetTop,
          // The inside edge of the title's own paper, left of its first letter.
          brand: { x: brand.x + 3, y: brand.y + brand.height / 2 },
        };
      });
      const screen = await shot(app, `fade-${theme}`);
      const at = (x, y) => rgb(screen, box.x + x, box.y + y);
      const behind = rgb(screen, 20, 300); // the desktop's own colour
      const away = (c) => Math.hypot(...c.map((v, i) => v - behind[i]));
      const mid = rect.x + rect.width * 0.5;
      const top = at(mid, rect.y + 5),
        low = at(mid, rect.y + rect.height - 6);
      rec.frame(`fade-${theme}`);
      expect(
        away(low) - away(top),
        `${theme}: the top shows more of the page behind than the bottom`,
      ).toBeGreaterThan(25);
      // The paper is solid by the first row of the message list, so no line of
      // an answer sits on the page behind.
      const list = at(mid, rect.y + rect.list + 2);
      expect(
        Math.abs(away(list) - away(low)),
        `${theme}: the paper under the message list is solid`,
      ).toBeLessThan(18);
      // The pin sits on its own paper: a clear step from the faded card behind.
      const pin = at(rect.pin.x, rect.pin.y);
      expect(away(pin), `${theme}: the pin is drawn solid`).toBeGreaterThan(
        away(top),
      );
      // The title sits on its own paper as well, not on the fade.
      const title = at(rect.brand.x, rect.brand.y);
      expect(away(title), `${theme}: the title is drawn solid`).toBeGreaterThan(
        away(top),
      );
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
