import { test, expect } from "@playwright/test";
import { launch, move, click, key } from "./support.mjs";
import { background, onBlink, clickBlink, reveal } from "./helpers.mjs";
import { place, cardPage, cardShown, machine, clickIn } from "./walk.mjs";
import { record } from "./record.mjs";

/** One recording per row of checklist-324 that no earlier spec records under
 * the row's own id. */

const emit = (app, event) =>
  app.evaluate((_e, event) => globalThis.blinklingTest.send(event), event);
const openCard = (page) =>
  page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test("stuck: the card and the permission bubble each close with Esc, a click outside and the close button, also after Blink changed its edge", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("stuck", { suffix: "-324" });
  const bubble = page.locator("#permission-alert");
  try {
    const frame = await background(app);
    for (const [edge, ratio] of [
      ["right", 0.5],
      ["left", 0.4],
    ]) {
      await place(app, edge, ratio);
      await page.waitForTimeout(700);
      // Empty page on the side away from the card.
      const away = {
        x: edge === "right" ? frame.x + 140 : frame.x + frame.width - 160,
        y: frame.y + 170,
      };
      // The card: Esc, then the close button, then a click outside.
      for (const how of ["esc", "button", "outside"]) {
        await reveal(page);
        await page.waitForTimeout(500);
        await openCard(page);
        await expect.poll(() => cardShown(app), { timeout: 5000 }).toBe(true);
        await page.waitForTimeout(900);
        rec.frame(`card-${edge}-${how}`);
        if (how === "esc") key(0xff1b);
        else if (how === "button")
          await clickIn(
            app,
            cardPage(app).locator(".gl-card-header button").last(),
          );
        else click(away.x, away.y);
        await expect
          .poll(() => cardShown(app), {
            timeout: 4000,
            message: `${edge} ${how}`,
          })
          .toBe(false);
        await page.waitForTimeout(500);
      }
      // A card that opened by itself has no focus; Esc still closes it.
      await emit(app, {
        type: "blink-say",
        text: "This card opened by itself.",
      });
      await expect.poll(() => cardShown(app), { timeout: 8000 }).toBe(true);
      const focused = await app.evaluate(() =>
        globalThis.blinklingTest.composer.isFocused(),
      );
      await page.waitForTimeout(900);
      rec.frame(`card-${edge}-unfocused-${focused}`);
      key(0xff1b);
      await expect
        .poll(() => cardShown(app), {
          timeout: 4000,
          message: `${edge} unfocused esc`,
        })
        .toBe(false);
      await page.waitForTimeout(500);
      // The permission bubble: Esc, its close button, then a click outside.
      for (const how of ["esc", "button", "outside"]) {
        await emit(app, { type: "activity", state: "permission" });
        await expect(bubble).toBeVisible();
        await page.waitForTimeout(400);
        rec.frame(`permission-${edge}-${how}`);
        if (how === "esc") key(0xff1b);
        else if (how === "button") {
          const blink = await app.evaluate(() =>
            globalThis.blinklingTest.blink.getBounds(),
          );
          const at = await page.locator("#permission-close").boundingBox();
          click(blink.x + at.x + at.width / 2, blink.y + at.y + at.height / 2);
        } else click(away.x, away.y);
        await expect(bubble, `${edge} ${how}`).toBeHidden({ timeout: 4000 });
        await emit(app, { type: "activity", state: "idle" });
        await page.waitForTimeout(400);
      }
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
