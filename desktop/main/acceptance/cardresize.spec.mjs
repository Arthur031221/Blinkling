import { test, expect } from "@playwright/test";
import { launch, native, click } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const place = (app, edge, ratio, shrink = 0) =>
  app.evaluate(
    async ({ screen }, [edge, ratio, shrink]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      // A Dock (or a taskbar) takes `shrink` px off the bottom of the work area.
      t.setDisplay({
        ...d,
        id: d.id,
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
        workArea: { ...d.workArea, height: d.workArea.height - shrink },
      });
    },
    [edge, ratio, shrink],
  );
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const openCard = (page) =>
  page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
const cardBox = (app) =>
  app.evaluate(() => globalThis.blinklingTest.composer.getBounds());
const closeCard = async (app) => {
  await app.evaluate(() =>
    globalThis.blinklingTest.nBlinkMenuFaces.escapeKeys.press(),
  );
  await new Promise((r) => setTimeout(r, 900));
};
async function show(app, page, edge, ratio, shrink = 0) {
  await place(app, edge, ratio, shrink);
  await page.waitForTimeout(500);
  await reveal(page);
  await page.waitForTimeout(900);
  await openCard(page);
  await expect.poll(() => cardPage(app)).toBeTruthy();
  await page.waitForTimeout(900);
}
/** The point just inside a handle of the card, in screen pixels. */
async function handleAt(app, edge) {
  const b = await cardBox(app);
  const h = await cardPage(app)
    .locator(`.gl-resize[data-edge="${edge}"]`)
    .boundingBox();
  return { x: b.x + h.x + h.width / 2, y: b.y + h.y + h.height / 2 };
}
async function drag(app, edge, dx, dy) {
  const from = await handleAt(app, edge);
  const steps = 10;
  native([
    { type: "move", ...from },
    { type: "down" },
    ...Array.from({ length: steps }, (_, i) => ({
      type: "move",
      x: Math.round(from.x + (dx * (i + 1)) / steps),
      y: Math.round(from.y + (dy * (i + 1)) / steps),
      wait: 0.04,
    })),
    { type: "up" },
  ]);
  await new Promise((r) => setTimeout(r, 500));
}
const sizeOf = async (app) => {
  const b = await cardBox(app);
  return [b.width, b.height];
};
/** Where the tail ends against the height of Blink's mouth. */
async function tailLevel(app) {
  const tail = await cardPage(app).evaluate(() => {
    const el = document.querySelector(".gl-chat-card");
    const r = el.getBoundingClientRect();
    return {
      side: el.dataset.tail,
      y:
        screenY + r.top + parseFloat(el.style.getPropertyValue("--gl-tail-at")),
    };
  });
  const mouth = await app.evaluate(() => globalThis.blinklingTest.mouth());
  return { side: tail.side, off: Math.abs(tail.y - mouth.y) };
}

test("the card is resized by dragging its edges and corners, within limits, and remembers its size", async () => {
  test.setTimeout(300000);
  const { app, page } = await launch();
  const rec = record("card_resize", { suffix: "-324" });
  try {
    await background(app);
    await show(app, page, "right", 0.5);
    const home = await sizeOf(app);
    rec.frame("home");
    // Each corner grows the card on both sides; the edges one side each.
    const growth = {
      se: [60, 50],
      ne: [60, -50],
      sw: [-60, 50],
      nw: [-60, -50],
    };
    const got = { ...Object.fromEntries([["home", home]]) };
    for (const [corner, [dx, dy]] of Object.entries(growth)) {
      const before = await sizeOf(app);
      await drag(app, corner, dx, dy);
      const after = await sizeOf(app);
      rec.frame(corner);
      got[corner] = after;
      expect(after[0], `${corner} width`).toBe(before[0] + Math.abs(dx));
      expect(after[1], `${corner} height`).toBe(before[1] + Math.abs(dy));
      const { off } = await tailLevel(app);
      expect(off, `${corner} tail level`).toBeLessThan(5);
    }
    // An edge changes one dimension only.
    const wide = await sizeOf(app);
    await drag(app, "e", 40, 25);
    const e = await sizeOf(app);
    expect([e[0] - wide[0], e[1] - wide[1]]).toEqual([40, 0]);
    await drag(app, "s", 25, 30);
    const s = await sizeOf(app);
    expect([s[0] - e[0], s[1] - e[1]]).toEqual([0, 30]);
    await drag(app, "n", 0, -20);
    const n = await sizeOf(app);
    expect([n[0] - s[0], n[1] - s[1]]).toEqual([0, 20]);
    await drag(app, "w", -30, 0);
    const w = await sizeOf(app);
    expect([w[0] - n[0], w[1] - n[1]]).toEqual([30, 0]);
    rec.frame("edges");
    // Limits: pulled in far, it stops at the smallest, pulled out far at the largest.
    await drag(app, "se", -2000, -2000);
    expect(await sizeOf(app)).toEqual([320, 280]);
    rec.frame("smallest");
    const area = await app.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().workArea,
    );
    await drag(app, "se", 3000, 3000);
    const biggest = await cardBox(app);
    rec.frame("largest");
    expect(biggest.width).toBeLessThanOrEqual(Math.floor(area.width * 0.9));
    expect(biggest.height).toBeLessThanOrEqual(Math.floor(area.height * 0.9));
    expect(biggest.x).toBeGreaterThanOrEqual(area.x);
    expect(biggest.y).toBeGreaterThanOrEqual(area.y);
    // A size given to the card is the card's size, and it is kept.
    await drag(app, "nw", 100, 100);
    const kept = await sizeOf(app);
    await closeCard(app);
    await show(app, page, "right", 0.5);
    expect(await sizeOf(app)).toEqual(kept);
    const stored = await app.evaluate(
      () => globalThis.blinklingTest.positionStore.cardSize,
    );
    expect(stored.width).toBeGreaterThan(0);
    // The card still follows Blink: Blink moved along its edge, the card goes with it.
    await closeCard(app);
    await show(app, page, "right", 0.25);
    expect(await sizeOf(app)).toEqual(kept);
    const { off } = await tailLevel(app);
    expect(off).toBeLessThan(5);
    rec.frame("followed");
    // A double click on a handle puts the card back to sizing itself.
    const at = await handleAt(app, "se");
    click(at.x, at.y);
    click(at.x, at.y);
    await expect.poll(() => sizeOf(app)).not.toEqual(kept);
    rec.frame("reset");
    const after = await app.evaluate(
      () => globalThis.blinklingTest.positionStore.cardSize,
    );
    expect(after).toBeNull();
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("the card reaches the bottom of the work area with a Dock or a taskbar taking its share", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("card_bottom", { suffix: "-324" });
  try {
    await background(app);
    for (const [label, ratio, shrink] of [
      ["no Dock", 0.97, 0],
      ["Dock 70", 0.97, 70],
      ["Dock 110", 0.97, 110],
      ["Dock 70 high", 0.5, 70],
    ]) {
      await show(app, page, "right", ratio, shrink);
      const b = await cardBox(app);
      const card = await cardPage(app).locator(".gl-chat-card").boundingBox();
      const area = await app.evaluate(
        ({ screen }) => screen.getPrimaryDisplay().workArea,
      );
      const bottom = b.y + card.y + card.height;
      const floor = area.y + area.height - shrink;
      rec.frame(label.replace(/\s/g, "-"));
      expect(bottom, `${label} reaches`).toBeLessThanOrEqual(floor);
      // The card is asked to stand 6 px over the bottom (its window 10 px past
      // the area); a window manager that keeps windows on screen, as this one
      // does, leaves it at the 16 px of shadow room at most.
      const want = await app.evaluate(() =>
        globalThis.blinklingTest.cardBounds(),
      );
      if (ratio > 0.8) {
        expect(floor - bottom, `${label} gap`).toBeLessThanOrEqual(16);
        expect(
          want.y + want.height - 16,
          `${label} asks for the bottom`,
        ).toBeGreaterThanOrEqual(floor - 6);
      }
      await closeCard(app);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
