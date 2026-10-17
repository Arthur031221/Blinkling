import { test, expect } from "@playwright/test";
import { launch, bodyPoint } from "./support.mjs";
import { background, reveal, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const read = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
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
/** Starts noting, every few milliseconds, whether the card window is on screen
 * and, every frame, whether any menu bubble is drawn. */
async function sampling(app, page) {
  await app.evaluate(() => {
    globalThis.__cards = [];
    globalThis.__sampler = setInterval(() => {
      const w = globalThis.blinklingTest.composer;
      globalThis.__cards.push([
        Date.now(),
        Boolean(w && !w.isDestroyed() && w.isVisible()),
      ]);
    }, 4);
  });
  await page.evaluate(() => {
    window.__menus = [];
    const step = () => {
      window.__menus.push([
        performance.timeOrigin + performance.now(),
        window.desktop.inspect().fan.shown,
      ]);
      requestAnimationFrame(step);
    };
    step();
  });
}
/** The longest stretch, in ms, in which a bubble and the card were both drawn
 * since the last call, and the times it began. */
async function overlap(app, page) {
  const cards = await app.evaluate(() => {
    const taken = globalThis.__cards;
    globalThis.__cards = [];
    return taken;
  });
  const menus = await page.evaluate(() => {
    const taken = window.__menus;
    window.__menus = [];
    return taken;
  });
  const cardAt = (t) => {
    let on = false;
    for (const [at, v] of cards) {
      if (at > t) break;
      on = v;
    }
    return on;
  };
  let longest = 0,
    began = null;
  for (const [t, shown] of menus) {
    if (shown && cardAt(t)) {
      began ??= t;
      longest = Math.max(longest, t - began);
    } else began = null;
  }
  return Math.round(longest);
}
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

test("the menu and the card never share the screen: each click on Blink, a dropped file and Esc hand over from one to the other", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("menu_card", { suffix: "-323" });
  try {
    await background(app);
    await place(app, "right", 0.6);
    await page.waitForTimeout(800);
    await sampling(app, page);
    const seen = {};

    // The menu out on hover, then a click on Blink: the card takes its place.
    await reveal(page);
    expect((await read(app)).menu).toBe(true);
    await overlap(app, page);
    rec.frame("menu");
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).card).toBe(true);
    await settle(page);
    seen.menuToCard = await overlap(app, page);
    rec.frame("card");

    // The card folds and the bubbles come out.
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).menu).toBe(true);
    await settle(page);
    seen.cardToMenu = await overlap(app, page);
    rec.frame("menu-again");

    // And back.
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).card).toBe(true);
    await settle(page);
    seen.menuToCardAgain = await overlap(app, page);

    // A file dropped on Blink while the hover menu is out.
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).menu).toBe(true);
    await settle(page);
    await overlap(app, page);
    const at = await bodyPoint(page);
    await page.evaluate(
      ([png, x, y]) => {
        const dt = new DataTransfer();
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], "note.png", { type: "image/png" }));
        document.dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: dt,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [PNG, at.x, at.y],
    );
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.snapshot().chatOpen),
      )
      .toBe(true);
    await settle(page, 1500);
    seen.dropped = await overlap(app, page);
    rec.frame("dropped");
    console.log("OVERLAP", JSON.stringify(seen));
    for (const [name, ms] of Object.entries(seen))
      expect(
        ms,
        `${name}: bubbles and card drawn together`,
      ).toBeLessThanOrEqual(34);
  } finally {
    await rec.stop();
    await app.close();
  }
});
