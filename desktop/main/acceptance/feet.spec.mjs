import { test, expect } from "@playwright/test";
import { launch, move } from "./support.mjs";
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

/** Samples the drawing on every animation frame: the turn of the figure and
 * whether the edge clip is on it. */
const watch = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((done) => {
        const seen = [],
          end = performance.now() + ms;
        const step = () => {
          const g = document.querySelector("#blink svg > g"),
            turn = /rotate\((-?[\d.]+)/.exec(
              g?.getAttribute("transform") ?? "",
            );
          seen.push({
            angle: turn ? Number(turn[1]) : 0,
            clip: !!document.querySelector('#blink svg clipPath[id^="fcb"]'),
            shoes: document.querySelectorAll(
              "#blink svg .blink-shoe, #blink svg [data-leg]",
            ).length,
          });
          if (performance.now() < end) requestAnimationFrame(step);
          else done(seen);
        };
        step();
      }),
    ms,
  );

for (const edge of ["left", "right"])
  test(`turning upright on the ${edge} edge keeps the legs whole`, async () => {
    test.setTimeout(120000);
    const { app, page } = await launch();
    const rec = record(`feet_${edge}`);
    try {
      await background(app);
      await place(app, edge, 0.5);
      await page.waitForTimeout(1500);
      // Peek to out: the pointer comes to Blink.
      const turning = watch(page, 1300);
      await reveal(page);
      rec.frame("out");
      const seen = await turning;
      const out = await watch(page, 200);
      expect(out.at(-1).angle).toBeCloseTo(0, 0);
      const early = seen.filter(
        (s) => Math.abs(s.angle) > 0.5 && Math.abs(s.angle) < 36,
      );
      expect(early.length, "the turn was sampled").toBeGreaterThan(2);
      for (const s of early)
        expect(s.clip, `no clip at ${s.angle} degrees`).toBe(false);
      // Out to peek: the pointer leaves and Blink retreats.
      move(640, 700);
      const back = await watch(page, 2600);
      const mid = back.filter(
        (s) => Math.abs(s.angle) > 0.5 && Math.abs(s.angle) < 36,
      );
      expect(mid.length, "the return was sampled").toBeGreaterThan(2);
      for (const s of mid)
        expect(s.clip, `no clip at ${s.angle} degrees`).toBe(false);
    } finally {
      await rec.stop();
      await app.close();
    }
  });
