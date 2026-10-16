import { test, expect } from "@playwright/test";
import { launch, native, bodyBox } from "./support.mjs";
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
const openCard = (page) =>
  page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
const cardBox = (app) =>
  app.evaluate(() => globalThis.blinklingTest.composer.getBounds());
/** The card's place and Blink's drawn body, both in screen pixels. */
async function both(app, page) {
  const card = await cardBox(app);
  const body = await bodyBox(page);
  const blink = await app.evaluate(() =>
    globalThis.blinklingTest.blink.getBounds(),
  );
  return {
    card,
    body: { x: body.x + blink.x, y: body.y + blink.y, ...body },
  };
}

test("an open card follows Blink while it is carried, keeping its offset, and the carry does not close it", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("card_follow_drag", { suffix: "-321" });
  try {
    const b = await background(app);
    await place(app, "right", 0.8);
    await page.waitForTimeout(500);
    await reveal(page);
    await openCard(page);
    await expect
      .poll(() => cardBox(app).then((c) => c.width), { timeout: 8000 })
      .toBeGreaterThan(200);
    await page.waitForTimeout(900);
    const rest = await both(app, page);
    rec.frame("rest");
    const body = await bodyBox(page);
    const grab = {
      x: b.x + body.x + body.width * 0.35,
      y: b.y + body.y + body.height * 0.72,
    };
    native([
      { type: "move", ...grab, wait: 0.05 },
      { type: "down" },
      { type: "move", x: grab.x - 20, y: grab.y - 10, wait: 0.25 },
    ]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    let first;
    // Carried along a path, the card keeps its distance from Blink the whole way.
    for (const [dx, dy] of [
      [-120, 10],
      [-260, -20],
      [-420, 60],
      [-300, 100],
      [-150, 40],
    ]) {
      native([
        {
          type: "move",
          x: grab.x + dx,
          y: grab.y + dy,
          wait: 0.35,
        },
      ]);
      const now = await both(app, page);
      expect(now.card.width, "the card stays open").toBeGreaterThan(200);
      // The card moved exactly as far as the pointer carried Blink.
      expect(
        Math.abs(now.card.x - rest.card.x - dx),
        `${dx},${dy} x`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(now.card.y - rest.card.y - dy),
        `${dx},${dy} y`,
      ).toBeLessThanOrEqual(2);
      // Blink, held, keeps one place in the card's frame the whole carry.
      const centre = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const held = {
        x: centre(now.body).x - now.card.x,
        y: centre(now.body).y - now.card.y,
      };
      first ??= held;
      expect(
        Math.abs(held.x - first.x),
        `${dx},${dy} body x`,
      ).toBeLessThanOrEqual(14);
      expect(
        Math.abs(held.y - first.y),
        `${dx},${dy} body y`,
      ).toBeLessThanOrEqual(14);
      rec.frame(`carried-${Math.abs(dx)}`);
    }
    native([{ type: "up" }]);
    await page.waitForTimeout(900);
    const dropped = await both(app, page);
    expect(dropped.card.width).toBeGreaterThan(200);
    // At rest again the card sits beside Blink, not on it.
    const gap =
      dropped.card.x > dropped.body.x
        ? dropped.card.x - (dropped.body.x + dropped.body.width)
        : dropped.body.x - (dropped.card.x + dropped.card.width);
    expect(gap).toBeGreaterThanOrEqual(-12);
    rec.frame("dropped");
  } finally {
    await rec.stop();
    await app.close();
  }
});
