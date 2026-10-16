import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch, move, native, key } from "./support.mjs";
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

/** Where a click lands, found by the pixels: a spot in the margin ring (taken
 * by Blink) and a spot a hand's breadth outside it (falls through). */
async function spots(page) {
  await page.addStyleTag({
    content: "#menu,#grumble,#permission-alert{display:none!important}",
  });
  const shot = PNG.sync.read(await page.screenshot({ omitBackground: true }));
  const { width, height, data } = shot;
  let top = 0;
  for (let i = 0; i < width * height; i++) top = Math.max(top, data[i * 4 + 3]);
  const drawn = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height
      ? data[(y * width + x) * 4 + 3] >= top / 2
      : false;
  const rects = await page.evaluate(() => window.desktop.hit());
  const inArea = (x, y) =>
    rects.some(
      (r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height,
    );
  const gap = (x, y, reach) => {
    for (let j = -reach; j <= reach; j++)
      for (let i = -reach; i <= reach; i++)
        if (i * i + j * j <= reach * reach && drawn(x + i, y + j)) return true;
    return false;
  };
  let ring = null,
    out = null;
  for (let y = 12; y < height - 12; y += 2)
    for (let x = 12; x < width - 12; x += 2) {
      if (drawn(x, y) || gap(x, y, 2)) continue;
      // In the ring: Blink takes it, and the drawing is within the margin.
      if (!ring && inArea(x, y) && gap(x, y, MARGIN - 2) && !gap(x, y, 2))
        ring = { x, y };
      // Outside: not in the area and farther than the margin and its slack.
      if (!out && !inArea(x, y) && !gap(x, y, MARGIN + 8) && gap(x, y, 40))
        out = { x, y };
    }
  return { ring, out };
}

test("a real click in the margin ring is Blink's and one a hand's breadth outside falls through to the window below", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const reached = () =>
    app.evaluate(() => globalThis.bg.webContents.executeJavaScript("clicks"));
  try {
    await background(app);
    for (const edge of ["left", "right", "top", "bottom"]) {
      await place(app, edge, 0.5);
      move(640, 400);
      await page.waitForTimeout(1700);
      const { ring, out } = await spots(page);
      expect(ring, `${edge}: a spot in the ring`).not.toBeNull();
      expect(out, `${edge}: a spot outside`).not.toBeNull();
      const before = (await reached()).length;
      // Press at once on arrival: resting on Blink first would open its menu,
      // and the click area is the menu's then.
      const tap = ({ x, y }) =>
        native([
          { type: "move", x, y, wait: 0 },
          { type: "down", wait: 0 },
          { type: "up", wait: 0 },
        ]);
      tap(ring);
      await page.waitForTimeout(400);
      expect(
        (await reached()).length,
        `${edge}: the click in the ring did not fall through`,
      ).toBe(before);
      move(640, 400);
      await page.waitForTimeout(1700);
      tap(out);
      await page.waitForTimeout(400);
      expect(
        (await reached()).length,
        `${edge}: the click outside reached the window below`,
      ).toBe(before + 1);
      key(0xff1b);
      move(640, 400);
      await page.waitForTimeout(2200);
    }
  } finally {
    await app.close();
  }
});
