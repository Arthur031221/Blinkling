import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch, move, native } from "./support.mjs";
import { background, onBlink, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

/** Rows of checklist-324 that need only the app: the first click after start
 * and the long press that picks Blink up. */
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
const machine = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());

test("a click in the first second after start throws nothing and logs no error", async () => {
  test.setTimeout(120000);
  const errors = [];
  const { app, page } = await launch();
  const rec = record("early_click_linux", { suffix: "-324", fps: 4 });
  try {
    page.on("pageerror", (e) => errors.push(String(e)));
    app.process().stderr?.on("data", (d) => {
      const line = String(d);
      if (/TypeError|ReferenceError|Uncaught|hookedPress/.test(line))
        errors.push(line.slice(0, 300));
    });
    // Press at once, ten times in the first second, anywhere on the screen.
    for (let i = 0; i < 10; i++) {
      native([
        { type: "move", x: 300 + i * 40, y: 300, wait: 0 },
        { type: "down", wait: 0 },
        { type: "up", wait: 0 },
      ]);
      await page.waitForTimeout(80);
    }
    rec.frame("after-early-clicks");
    await page.waitForTimeout(1500);
    expect(errors, "no error from an early click").toEqual([]);
    expect(await app.evaluate(() => !!globalThis.blinklingTest)).toBe(true);
    // Still alive after the clicks: Blink comes out to the pointer.
    await onBlink(page);
    rec.frame("running");
  } finally {
    await rec.stop();
    await app.close();
  }
});

/** Drawn pixels of the figure (menu hidden), and the spots to press: spread
 * over the whole figure, plus one a hand's breadth away from it. */
async function spots(page) {
  await page.addStyleTag({
    content: "#menu,#grumble,#permission-alert{display:none!important}",
  });
  const { width, height, data } = PNG.sync.read(
    await page.screenshot({ omitBackground: true }),
  );
  let top = 0;
  for (let i = 0; i < width * height; i++) top = Math.max(top, data[i * 4 + 3]);
  const drawn = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height
      ? data[(y * width + x) * 4 + 3] >= top / 2
      : false;
  const pts = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (drawn(x, y)) pts.push({ x, y });
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const box = {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
  const near = (fx, fy) => {
    const tx = box.x0 + (box.x1 - box.x0) * fx,
      ty = box.y0 + (box.y1 - box.y0) * fy;
    return pts.reduce((a, b) =>
      Math.hypot(b.x - tx, b.y - ty) < Math.hypot(a.x - tx, a.y - ty) ? b : a,
    );
  };
  const body = [
    ["top", near(0.5, 0.1)],
    ["left", near(0.1, 0.5)],
    ["middle", near(0.5, 0.5)],
    ["right", near(0.9, 0.5)],
    ["bottom", near(0.5, 0.9)],
  ];
  const rects = await page.evaluate(() => window.desktop.hit());
  const inArea = (x, y) =>
    rects.some(
      (r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height,
    );
  const far = (x, y) => {
    for (const p of pts) if (Math.hypot(p.x - x, p.y - y) < 60) return false;
    return true;
  };
  let out = null;
  for (let y = 40; y < height - 40 && !out; y += 4)
    for (let x = 40; x < width - 40; x += 4)
      if (!inArea(x, y) && far(x, y) && !drawn(x, y)) {
        out = { x, y };
        break;
      }
  return { body, out };
}

test("a long press on every part of the drawn Blink picks it up, and one outside the shape reaches the window below", async () => {
  test.setTimeout(300000);
  const { app, page } = await launch();
  const rec = record("long_press_grab", { suffix: "-324", fps: 4 });
  const reached = () =>
    app.evaluate(() => globalThis.bg.webContents.executeJavaScript("clicks"));
  try {
    await background(app);
    for (const edge of ["bottom", "right"]) {
      await place(app, edge, 0.5);
      move(640, 400);
      await page.waitForTimeout(1700);
      await reveal(page);
      await page.waitForTimeout(1500);
      const { body, out } = await spots(page);
      expect(out, `${edge}: a spot outside the shape`).not.toBeNull();
      for (const [name, at] of body) {
        native([{ type: "move", x: at.x, y: at.y, wait: 0 }]);
        await page.waitForTimeout(150);
        native([{ type: "down", wait: 0 }]);
        await page.waitForTimeout(700);
        const state = await machine(app);
        rec.frame(`${edge}-${name}-held`);
        expect(
          state.held,
          `${edge}: held after a long press on the ${name}`,
        ).toBe(true);
        native([{ type: "up", wait: 0 }]);
        await page.waitForTimeout(500);
        expect((await machine(app)).held, `${edge}: let go`).toBe(false);
      }
      // Outside the shape: the press goes to the window below, nothing is held.
      move(640, 400);
      await page.waitForTimeout(2000);
      const before = (await reached()).length;
      native([
        { type: "move", x: out.x, y: out.y, wait: 0 },
        { type: "down", wait: 0 },
      ]);
      await page.waitForTimeout(700);
      expect((await machine(app)).held, `${edge}: nothing held outside`).toBe(
        false,
      );
      native([{ type: "up", wait: 0 }]);
      await page.waitForTimeout(400);
      expect((await reached()).length, `${edge}: the press fell through`).toBe(
        before + 1,
      );
      rec.frame(`${edge}-outside`);
      move(640, 400);
      await page.waitForTimeout(2200);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
