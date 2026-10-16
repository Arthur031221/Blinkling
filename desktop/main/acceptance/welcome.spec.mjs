import { test, expect } from "@playwright/test";
import { launch, move } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const read = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());

// How long the window is watched; the first-run report saw it close after
// 12 s to 3 min, so a long run can be asked for.
const HOLD = Number(process.env.WELCOME_HOLD_MS ?? 30000);

for (const [name, hook] of [
  ["welcome", "welcome"],
  ["settings", "settings"],
]) {
  test(`${name}: the window stays open while the pointer rests on it, and Blink stays out beside it until it is closed`, async () => {
    test.setTimeout(HOLD + 90000);
    const { app, page } = await launch();
    const rec = record(`${name}_stays`);
    try {
      await background(app);
      await reveal(page);
      await app.evaluate(
        (_, hook) => globalThis.blinklingTest[hook].open(),
        hook,
      );
      const bounds = () =>
        app.evaluate(({ BrowserWindow }, name) => {
          const w = BrowserWindow.getAllWindows().find((x) =>
            x.webContents.getURL().includes(`/${name}/index.html`),
          );
          return { visible: w.isVisible(), ...w.getBounds() };
        }, name);
      await expect.poll(async () => (await bounds()).visible).toBe(true);
      await page.waitForTimeout(900);
      const b = await bounds();
      move(b.x + b.width / 2, b.y + b.height - 40);
      rec.frame("pointer-rests");
      const end = Date.now() + HOLD;
      while (Date.now() < end) {
        const seen = await read(app);
        expect(seen.out, "Blink stays out").toBe(true);
        expect((await bounds()).visible, `${name} stays open`).toBe(true);
        await page.waitForTimeout(500);
      }
      rec.frame("after-hold");
      await app.evaluate(
        (_, hook) => globalThis.blinklingTest[hook].close(),
        hook,
      );
      await expect
        .poll(async () => (await read(app)).out, { timeout: 8000 })
        .toBe(false);
      rec.frame("closed-and-retreated");
    } finally {
      await rec.stop();
      await app.close();
    }
  });
}
