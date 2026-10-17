import { test, expect } from "@playwright/test";
import { launch, move } from "./support.mjs";
import { background, onBlink } from "./helpers.mjs";
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

/** The middle of the spot where the pointer touches `part` on `side`, found by
 * asking the character about every pixel around it. */
const spot = (page, part, side) =>
  page.evaluate(
    ([part, side]) => {
      const c = window.desktop.character,
        r = document.querySelector(".blink-body").getBoundingClientRect();
      const hits = [];
      for (let x = r.x - 60; x < r.x + r.width + 60; x += 2)
        for (let y = r.y - 60; y < r.y + r.height + 100; y += 2) {
          const t = c.touchAt({ x, y });
          if (t && t.part === part && t.side === side) hits.push({ x, y });
        }
      if (!hits.length) return null;
      const m = hits.reduce(
        (a, p) => ({ x: a.x + p.x / hits.length, y: a.y + p.y / hits.length }),
        { x: 0, y: 0 },
      );
      return hits.reduce((b, p) =>
        Math.hypot(p.x - m.x, p.y - m.y) < Math.hypot(b.x - m.x, b.y - m.y)
          ? p
          : b,
      );
    },
    [part, side],
  );

const watch = (page) =>
  page.evaluate(() => {
    window.__poses = [];
    const step = () => {
      const key = window.desktop.character.key();
      if (window.__poses.at(-1) !== key) window.__poses.push(key);
      requestAnimationFrame(step);
    };
    step();
  });

const PARTS = [
  ["head", 0],
  ["belly", 0],
  ["cheek", -1],
  ["cheek", 1],
  ["hand", -1],
  ["hand", 1],
  ["foot", -1],
  ["foot", 1],
];

test("the pointer touches the part that is drawn under it, on every edge", async () => {
  test.setTimeout(300000);
  const { app, page } = await launch();
  const rec = record("hover_parts", { suffix: "-324", fps: 8 });
  try {
    await background(app);
    await watch(page);
    for (const [edge, ratio] of [
      ["bottom", 0.5],
      ["right", 0.5],
      ["top", 0.5],
      ["left", 0.5],
    ]) {
      await place(app, edge, ratio);
      await page.waitForTimeout(900);
      await onBlink(page);
      for (const [part, side] of PARTS) {
        const at = await spot(page, part, side);
        expect(at, `${edge}: ${part} ${side} has a place`).not.toBeNull();
        await page.evaluate(() => (window.__poses = []));
        move(at.x, at.y);
        await page.waitForTimeout(150);
        move(at.x + 1, at.y);
        await expect
          .poll(() => page.evaluate(() => window.__poses), {
            timeout: 3000,
            message: `${edge}: the ${part} ${side} reacted`,
          })
          .toContain(`touch:${part}${side}`);
        rec.frame(`${edge}-${part}${side}`);
        await page.waitForTimeout(250);
      }
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
