import { test, expect } from "@playwright/test";
import { launch, move, native, bodyPoint } from "./support.mjs";
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
            // A shoe is a rounded rectangle in the shoe colour (rig.mjs).
            shoes: document.querySelectorAll('#blink svg rect[fill="#121614"]')
              .length,
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
    const rec = record(`feet_${edge}`, { suffix: "-324" });
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
      // Both legs are drawn in every sampled frame of the turn.
      const legs = out.at(-1).shoes;
      expect(legs, "legs in the upright pose").toBeGreaterThanOrEqual(2);
      for (const s of early)
        expect(s.shoes, `legs at ${s.angle} degrees`).toBe(legs);
      // Out to peek: the pointer leaves and Blink retreats.
      move(640, 700);
      const back = await watch(page, 2600);
      const mid = back.filter(
        (s) => Math.abs(s.angle) > 0.5 && Math.abs(s.angle) < 36,
      );
      expect(mid.length, "the return was sampled").toBeGreaterThan(2);
      for (const s of mid) {
        expect(s.clip, `no clip at ${s.angle} degrees`).toBe(false);
        expect(s.shoes, `legs at ${s.angle} degrees`).toBe(legs);
      }
    } finally {
      await rec.stop();
      await app.close();
    }
  });

test("the legs stay whole while Blink is picked up, carried and dropped", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("feet_carry", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(1500);
    await reveal(page);
    const upright = (await watch(page, 100)).at(-1).shoes;
    expect(upright).toBeGreaterThanOrEqual(2);
    const grab = await bodyPoint(page);
    native([
      { type: "move", x: grab.x, y: grab.y },
      { type: "down", wait: 0 },
    ]);
    const seen = watch(page, 2600);
    native([
      ...Array.from({ length: 40 }, (_, i) => ({
        type: "move",
        x: grab.x - 8 - i * 9,
        y: grab.y - 40 + Math.sin(i / 5) * 60,
        wait: 0.016,
      })),
      { type: "wait", seconds: 0.2 },
      { type: "up" },
    ]);
    const frames = await seen;
    rec.frame("dropped");
    expect(frames.length).toBeGreaterThan(60);
    for (const [i, f] of frames.entries())
      expect(f.shoes, `legs in frame ${i}`).toBe(upright);
    // While it is carried nothing of it is cut off by an edge.
    expect(frames.slice(0, 40).some((f) => f.clip)).toBe(false);
  } finally {
    await rec.stop();
    await app.close();
  }
});
