import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const place = (app, edge, ratio) =>
  app.evaluate(
    async ({ screen }, [edge, ratio]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    [edge, ratio],
  );
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const openCard = (page) =>
  page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );

/** Where the card's tail ends on the screen and where Blink's body is drawn,
 * both in screen pixels. */
async function tailAndBody(app, page) {
  await expect.poll(() => cardPage(app)).toBeTruthy();
  const card = cardPage(app);
  await expect(card.locator(".gl-chat-card[data-tail]")).toBeVisible();
  await card.waitForTimeout(500);
  const tail = await card.evaluate(() => {
    const el = document.querySelector(".gl-chat-card");
    const r = el.getBoundingClientRect();
    const at = parseFloat(el.style.getPropertyValue("--gl-tail-at"));
    const side = el.dataset.tail;
    const length = 10;
    return side === "right"
      ? { x: screenX + r.right + length, y: screenY + r.top + at }
      : side === "left"
        ? { x: screenX + r.left - length, y: screenY + r.top + at }
        : side === "top"
          ? { x: screenX + r.left + at, y: screenY + r.top - length }
          : { x: screenX + r.left + at, y: screenY + r.bottom + length };
  });
  const blink = await app.evaluate(() =>
    globalThis.blinklingTest.blink.getBounds(),
  );
  const body = await page.evaluate(() => {
    const r = document.querySelector(".blink-body").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return {
    tail,
    body: { ...body, x: body.x + blink.x, y: body.y + blink.y },
  };
}

test("the card's tail ends within 12 px of Blink's body at the height of its mouth, wherever Blink rests, and the card follows Blink", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("card_follow");
  try {
    await background(app);
    for (const [edge, ratio] of [
      ["right", 0.88],
      ["right", 0.3],
      ["left", 0.5],
    ]) {
      await place(app, edge, ratio);
      await page.waitForTimeout(500);
      await reveal(page);
      await page.waitForTimeout(900);
      await openCard(page);
      await page.waitForTimeout(900);
      rec.frame(`${edge}-${ratio}`);
      const { tail, body } = await tailAndBody(app, page);
      const gap =
        tail.x < body.x ? body.x - tail.x : tail.x - (body.x + body.width);
      expect(gap, `${edge} ${ratio} gap`).toBeLessThanOrEqual(12);
      expect(gap, `${edge} ${ratio} gap`).toBeGreaterThanOrEqual(-2);
      const mouthY = body.y + body.height * 0.5;
      expect(Math.abs(tail.y - mouthY), `${edge} ${ratio} level`).toBeLessThan(
        40,
      );
      await app.evaluate(() =>
        globalThis.blinklingTest.nBlinkMenuFaces.escapeKeys.press(),
      );
      await page.waitForTimeout(700);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
