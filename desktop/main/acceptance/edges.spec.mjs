import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { launch, move } from "./support.mjs";
import { background } from "./helpers.mjs";
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

/** Which pixels of a frame are drawn, as opposed to the flat test background. */
const mask = (file) => {
  const png = PNG.sync.read(readFileSync(file)),
    { width, height, data } = png;
  const bg = [data[0], data[1], data[2]];
  const on = new Uint8Array(width * height);
  for (let i = 0; i < on.length; i++) {
    const d =
      Math.abs(data[i * 4] - bg[0]) +
      Math.abs(data[i * 4 + 1] - bg[1]) +
      Math.abs(data[i * 4 + 2] - bg[2]);
    on[i] = d > 60 ? 1 : 0;
  }
  return { width, height, on };
};
const rows = ({ width, height, on }) => {
  let top = height;
  for (let i = 0; i < on.length; i++)
    if (on[i]) top = Math.min(top, (i / width) | 0);
  return height - top;
};

test("the right edge peek is the mirror of the left, and the bottom shows the head past the eyes", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("edge_tilt");
  try {
    await background(app);
    const shots = {};
    for (const [edge, crop] of [
      ["left", "260:300:0:250"],
      ["right", "260:300:1020:250"],
    ]) {
      await place(app, edge, 0.5);
      move(640, 400);
      await page.waitForTimeout(1600);
      shots[edge] = rec.frame(edge, crop);
    }
    const l = mask(shots.left),
      r = mask(shots.right);
    // Antialiasing and the pixel the right edge window sits off the mirror axis
    // move outlines by one pixel, so a pixel only differs when the other side
    // has nothing within one pixel of its mirror position.
    const near = (m, x, y) => {
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const xx = x + i,
            yy = y + j;
          if (
            xx >= 0 &&
            xx < m.width &&
            yy >= 0 &&
            yy < m.height &&
            m.on[yy * m.width + xx]
          )
            return true;
        }
      return false;
    };
    const area = l.on.reduce((n, v) => n + v, 0);
    let off = 0;
    for (let y = 0; y < l.height; y++)
      // Column 0 pairs with the screen's last column, which the X server paints black.
      for (let x = 1; x < l.width; x++) {
        const mx = r.width - 1 - x,
          a = l.on[y * l.width + x],
          b = r.on[y * r.width + mx];
        if ((a && !near(r, mx, y)) || (b && !near(l, x, y))) off++;
      }
    expect(area).toBeGreaterThan(1500);
    expect(off / area, "the right silhouette mirrors the left").toBeLessThan(
      0.03,
    );
    await place(app, "bottom", 0.5);
    move(640, 400);
    await page.waitForTimeout(1600);
    const bottom = mask(rec.frame("bottom", "360:200:460:600"));
    expect(
      rows(bottom),
      "head down past the eyes shows above the edge",
    ).toBeGreaterThan(44);
    // With a Dock or taskbar the work area is smaller than the screen; the peek
    // line is the work area's bottom, and nothing of Blink shows below it.
    await app.evaluate(async ({ screen }) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      t.setDisplay({
        ...d,
        workArea: { ...d.workArea, height: d.workArea.height - 80 },
      });
    });
    move(640, 400);
    await page.waitForTimeout(1600);
    const dock = mask(rec.frame("dock", "360:200:460:600"));
    let last = -1;
    // The X server paints the screen's last row black.
    for (let i = 0; i < dock.on.length - dock.width; i++)
      if (dock.on[i]) last = Math.max(last, (i / dock.width) | 0);
    expect(
      last + 600,
      "nothing of Blink shows below the work area",
    ).toBeLessThanOrEqual(720 + 4);
    expect(
      last + 600,
      "and it sits right on the work area's bottom",
    ).toBeGreaterThanOrEqual(720 - 6);
  } finally {
    await rec.stop();
    await app.close();
  }
});
