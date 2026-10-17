import { test, expect } from "@playwright/test";
import { launch, native, click } from "./support.mjs";
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

test("the card's tail ends within 12 px of Blink's body and within 5 px of the height of its mouth, wherever Blink rests, and the card follows Blink", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("card_follow", { suffix: "-324" });
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
      const mouth = await app.evaluate(() => globalThis.blinklingTest.mouth());
      expect(Math.abs(tail.y - mouth.y), `${edge} ${ratio} level`).toBeLessThan(
        5,
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

const cardBox = (app) =>
  app.evaluate(() => globalThis.blinklingTest.composer.getBounds());
const closeCard = async (app) => {
  await app.evaluate(() =>
    globalThis.blinklingTest.nBlinkMenuFaces.escapeKeys.press(),
  );
  await new Promise((r) => setTimeout(r, 900));
};
/** Drags the card by its title from the given screen point. */
async function dragTitle(app, dx, dy) {
  const card = cardPage(app);
  const brand = await card.locator(".gl-brand").boundingBox();
  const b = await cardBox(app);
  const from = { x: b.x + brand.x + brand.width / 2, y: b.y + brand.y + 6 };
  const steps = 8;
  native([
    { type: "move", ...from },
    { type: "down" },
    ...Array.from({ length: steps }, (_, i) => ({
      type: "move",
      x: Math.round(from.x + (dx * (i + 1)) / steps),
      y: Math.round(from.y + (dy * (i + 1)) / steps),
      wait: 0.03,
    })),
    { type: "up" },
  ]);
  await new Promise((r) => setTimeout(r, 400));
  return from;
}

test("the card can be dragged up to 120 px from where it opens, remembered per edge, and a double click on the header puts it back", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("card_nudge", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    await page.waitForTimeout(900);
    await openCard(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(900);
    const home = await cardBox(app);
    rec.frame("home");
    await dragTitle(app, -50, 30);
    const moved = await cardBox(app);
    rec.frame("moved");
    expect([moved.x - home.x, moved.y - home.y]).toEqual([-50, 30]);
    // The tail still points at Blink's mouth.
    await expect(
      cardPage(app).locator(".gl-chat-card[data-tail]"),
    ).toBeVisible();
    await dragTitle(app, -400, -300);
    const far = await cardBox(app);
    rec.frame("limit");
    expect(Math.hypot(far.x - home.x, far.y - home.y)).toBeLessThanOrEqual(
      120.5,
    );
    expect(Math.hypot(far.x - home.x, far.y - home.y)).toBeGreaterThan(110);
    // Closed and opened again, it opens where it was left.
    await closeCard(app);
    await openCard(page);
    await page.waitForTimeout(900);
    const again = await cardBox(app);
    expect([again.x, again.y]).toEqual([far.x, far.y]);
    // Another edge has its own place.
    await closeCard(app);
    await place(app, "left", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    await page.waitForTimeout(900);
    await openCard(page);
    await page.waitForTimeout(900);
    const left = await cardBox(app);
    const leftHome = await app.evaluate(() =>
      globalThis.blinklingTest.cardBounds(),
    );
    expect([left.x, left.y]).toEqual([leftHome.x, leftHome.y]);
    await closeCard(app);
    // A double click on the header resets this edge.
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    await page.waitForTimeout(900);
    await openCard(page);
    await page.waitForTimeout(900);
    const brand = await cardPage(app).locator(".gl-brand").boundingBox();
    const b = await cardBox(app);
    click(b.x + brand.x + brand.width / 2, b.y + brand.y + 6);
    click(b.x + brand.x + brand.width / 2, b.y + brand.y + 6);
    await expect
      .poll(async () => {
        const c = await cardBox(app);
        return [c.x - home.x, c.y - home.y];
      })
      .toEqual([0, 0]);
    rec.frame("reset");
  } finally {
    await rec.stop();
    await app.close();
  }
});
