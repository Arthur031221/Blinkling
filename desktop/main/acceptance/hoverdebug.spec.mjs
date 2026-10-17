import { test, expect } from "@playwright/test";
import { launch, move } from "./support.mjs";
import { background, onBlink, shot } from "./helpers.mjs";
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
const EDGES = ["bottom", "right", "top", "left"];
const PARTS = [
  ["head", 0],
  ["belly", 0],
  ["cheek", -1],
  ["hand", 1],
  ["foot", -1],
];
/** A spot in the middle of what the character says is `part` on `side`. */
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

test("the debug view draws the hit regions and the parts over Blink on every edge, and the pointer reacts inside them", async () => {
  test.setTimeout(300000);
  const { app, page } = await launch({ env: { BLINKLING_DEBUG_HIT: "1" } });
  const rec = record("hover_parts", { suffix: "-323", fps: 8 });
  try {
    await background(app);
    await watch(page);
    for (const edge of EDGES) {
      await place(app, edge, 0.5);
      await page.waitForTimeout(900);
      await onBlink(page);
      await expect(page.locator("#debug-hit path").first()).toBeVisible();
      expect(await page.locator("#debug-hit rect").count()).toBeGreaterThan(20);
      for (const [part, side] of PARTS) {
        const at = await spot(page, part, side);
        expect(at, `${edge}: ${part} ${side}`).not.toBeNull();
        await page.evaluate(() => (window.__poses = []));
        move(at.x, at.y);
        await page.waitForTimeout(150);
        move(at.x + 1, at.y);
        await expect
          .poll(() => page.evaluate(() => window.__poses), { timeout: 3000 })
          .toContain(`touch:${part}${side}`);
        rec.frame(`${edge}-${part}`);
        await page.waitForTimeout(250);
      }
      move(10, 10);
      await page.waitForTimeout(500);
    }
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
});

// What is drawn is what takes the pointer, read off a real screenshot at both scales.
for (const scale of [1, 2])
  test(`the pixels of Blink on the screen are inside the hit regions at ${scale}x, on every edge`, async () => {
    test.setTimeout(300000);
    const { app, page } = await launch({ scale });
    try {
      await background(app);
      for (const edge of EDGES) {
        await place(app, edge, 0.5);
        await page.waitForTimeout(1200);
        await onBlink(page, scale);
        move(8, 8);
        await page.waitForTimeout(1500);
        const png = await shot(app, `hoverdebug-${scale}x-${edge}`, 300);
        const body = await page.evaluate(() => ({
          polys: window.desktop.character.polygons(),
          rect: (() => {
            const r = document
              .querySelector(".blink-body")
              .getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          })(),
        }));
        const back = [
          ...png.data.subarray(
            (200 * scale * png.width + 200 * scale) * 4,
            (200 * scale * png.width + 200 * scale) * 4 + 3,
          ),
        ];
        const drawn = (x, y) => {
          // The caption of the backdrop is not Blink.
          if (x < 270 && y < 70) return false;
          if (
            x < 1 ||
            y < 1 ||
            x >= png.width / scale - 1 ||
            y >= png.height / scale - 1
          )
            return false;
          const i =
            (Math.round(y * scale) * png.width + Math.round(x * scale)) * 4;
          return (
            [0, 1, 2].reduce(
              (d, k) => d + Math.abs(png.data[i + k] - back[k]),
              0,
            ) > 40
          );
        };
        const inside = (poly, p) => {
          let hit = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i],
              b = poly[j];
            if (
              a.y > p.y !== b.y > p.y &&
              p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
            )
              hit = !hit;
          }
          return hit;
        };
        let greens = 0,
          lost = 0,
          probed = 0,
          stray = [];
        const r = body.rect;
        for (let x = Math.floor(r.x - 40); x < r.x + r.w + 40; x += 1)
          for (let y = Math.floor(r.y - 40); y < r.y + r.h + 60; y += 1) {
            if (!drawn(x, y)) continue;
            greens++;
            // Every green pixel is within 2 px of a polygon: nothing drawn is out of reach.
            const near = body.polys.some((p) =>
              [0, 2, -2].some((dx) =>
                [0, 2, -2].some((dy) => inside(p, { x: x + dx, y: y + dy })),
              ),
            );
            if (!near) stray.push([x, y]);
          }
        // And the other way: the inside of every region is drawn, nothing reaches into empty air.
        for (const poly of body.polys)
          for (let x = r.x - 40; x < r.x + r.w + 40; x += 3)
            for (let y = r.y - 40; y < r.y + r.h + 60; y += 3) {
              if (
                x < 2 ||
                y < 2 ||
                x > png.width / scale - 3 ||
                y > png.height / scale - 3 ||
                !inside(poly, { x, y })
              )
                continue;
              probed++;
              if (![0, 2, -2].some((d) => drawn(x + d, y) || drawn(x, y + d)))
                lost++;
            }
        expect(greens, `${edge}: Blink is on the screen`).toBeGreaterThan(300);
        expect(probed, `${edge}: regions are on the screen`).toBeGreaterThan(
          50,
        );
        expect(
          lost / probed,
          `${edge}: ${lost} of ${probed} region points are empty air`,
        ).toBeLessThan(0.12);
        expect(
          stray.length,
          `${edge}: green pixels outside every polygon ${JSON.stringify(stray.slice(0, 5))}`,
        ).toBeLessThan(6);
      }
    } finally {
      await app.close().catch(() => {});
    }
  });
