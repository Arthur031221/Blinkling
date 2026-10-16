import { test, expect } from "@playwright/test";
import { launch, move, bodyBox } from "./support.mjs";
import { background, reveal, onBlink, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";

const machine = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
/** Milliseconds from the pointer leaving until Blink is back at its edge. */
async function leaveTime(app, page, away) {
  const t0 = Date.now();
  move(away.x, away.y);
  for (;;) {
    if (!(await machine(app)).out) return Date.now() - t0;
    if (Date.now() - t0 > 4000) return Infinity;
    await page.waitForTimeout(20);
  }
}

test("leaving Blink with no card open retreats at once, with or without the menu, and not when a card is open", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("leave_retreat", { suffix: "-321" });
  try {
    const b = await background(app);
    const away = { x: b.x + 200, y: b.y + 200 };
    // Touch Blink only: no menu yet.
    await onBlink(page);
    rec.frame("touching");
    expect((await machine(app)).out).toBe(true);
    const bare = await leaveTime(app, page, away);
    rec.frame("left-bare");
    expect(bare, "retreat after touching").toBeLessThan(900);
    await page.waitForTimeout(600);
    // The menu is open: the corridor grace, then back.
    await reveal(page);
    expect((await machine(app)).menu).toBe(true);
    rec.frame("menu");
    const withMenu = await leaveTime(app, page, away);
    rec.frame("left-menu");
    expect(withMenu, "retreat after the menu").toBeLessThan(900);
    expect(withMenu, "the corridor grace is kept").toBeGreaterThan(300);
    await page.waitForTimeout(800);
    // With a card open Blink stays out.
    await reveal(page);
    await clickBlink(page);
    await expect
      .poll(async () => (await machine(app)).card, { timeout: 8000 })
      .toBe(true);
    move(away.x, away.y);
    await page.waitForTimeout(2500);
    expect(await machine(app)).toMatchObject({ out: true, card: true });
    rec.frame("card-stays");
    expect(await bodyBox(page)).toBeTruthy();
  } finally {
    await rec.stop();
    await app.close();
  }
});
