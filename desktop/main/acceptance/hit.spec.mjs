import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch, move } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const MARGIN = 6;
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

/** Compares what is really drawn with what takes the click: every drawn pixel
 * is in the click area, and nothing farther than the margin (plus a few pixels of
 * antialiasing) from the drawing is. */
async function compare(page, label) {
  await page.addStyleTag({
    content: "#menu,#grumble,#permission-alert{display:none!important}",
  });
  const shot = PNG.sync.read(await page.screenshot({ omitBackground: true }));
  const { width, height, data } = shot;
  const drawn = new Uint8Array(width * height);
  // A resting Blink is dimmed, so half of the strongest alpha counts as drawn.
  let top = 0;
  for (let i = 0; i < drawn.length; i++) top = Math.max(top, data[i * 4 + 3]);
  for (let i = 0; i < drawn.length; i++)
    drawn[i] = data[i * 4 + 3] >= top / 2 ? 1 : 0;
  const area = new Uint8Array(width * height);
  for (const r of await page.evaluate(() => window.desktop.hit()))
    for (let x = r.x; x < r.x + r.width; x++) area[r.y * width + x] = 1;
  if (process.env.HIT_DEBUG) {
    const xs = [],
      ys = [];
    for (let i = 0; i < drawn.length; i++)
      if (drawn[i]) {
        xs.push(i % width);
        ys.push((i / width) | 0);
      }
    console.log(
      label,
      "drawn",
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
      "area",
      JSON.stringify(
        (await page.evaluate(() => window.desktop.hit())).slice(0, 3),
      ),
    );
  }
  let missed = 0,
    stray = 0,
    seen = 0;
  const reach = MARGIN + 3;
  const near = (x, y) => {
    for (let j = -reach; j <= reach; j++)
      for (let i = -reach; i <= reach; i++) {
        if (i * i + j * j > reach * reach) continue;
        const xx = x + i,
          yy = y + j;
        if (
          xx >= 0 &&
          xx < width &&
          yy >= 0 &&
          yy < height &&
          drawn[yy * width + xx]
        )
          return true;
      }
    return false;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      if (drawn[at]) {
        seen++;
        if (!area[at]) missed++;
      } else if (area[at] && !near(x, y)) stray++;
    }
  expect(seen, `${label}: something is drawn`).toBeGreaterThan(800);
  expect(missed, `${label}: drawn pixels outside the click area`).toBe(0);
  expect(
    stray,
    `${label}: click area farther than the margin from the drawing`,
  ).toBe(0);
}

test("the click area is the drawn shape plus a margin, on every edge and pose", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("hit_area");
  try {
    await background(app);
    for (const edge of ["left", "right", "top", "bottom"]) {
      await place(app, edge, 0.5);
      move(640, 400);
      await page.waitForTimeout(1700);
      rec.frame(`${edge}-peek`);
      await compare(page, `${edge} peek`);
      await reveal(page);
      await page.waitForTimeout(1800);
      rec.frame(`${edge}-out`);
      await compare(page, `${edge} out`);
      move(640, 400);
      await page.waitForTimeout(2200);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
