import { test, expect } from "@playwright/test";
import { launch, native } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

// The windows a new user sees first: the welcome, the macOS permission guide
// and Settings. Each moves from its header and from any empty area, keeps its
// buttons and stays inside the work area.
const pageOf = (app, name) =>
  app.windows().find((p) => p.url().includes(`/${name}/index.html`));
const permissionPage = (app) =>
  app.windows().find((p) => p.url().includes("permission.html"));
const boundsOf = (app, match) =>
  app.evaluate(
    ({ BrowserWindow }, match) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes(match))
        .getBounds(),
    match,
  );
const workArea = (app) =>
  app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);

/** A real pointer drag from `from` by (dx, dy). */
function drag(from, dx, dy) {
  const steps = 10;
  native([
    { type: "move", ...from },
    { type: "down" },
    ...Array.from({ length: steps }, (_, i) => ({
      type: "move",
      x: Math.round(from.x + (dx * (i + 1)) / steps),
      y: Math.round(from.y + (dy * (i + 1)) / steps),
      wait: 0.03,
    })),
    { type: "up" },
  ]);
  return new Promise((r) => setTimeout(r, 400));
}

const windows = [
  {
    name: "welcome",
    match: "/welcome/index.html",
    open: (app) => app.evaluate(() => globalThis.blinklingTest.welcome.open()),
    page: (app) => pageOf(app, "welcome"),
    header: ".welcome-head [data-wordmark]",
    button: "#welcome-close",
    empty: { x: 18, y: 0.5 },
  },
  {
    name: "settings",
    match: "/settings/index.html",
    open: (app) => app.evaluate(() => globalThis.blinklingTest.settings.open()),
    page: (app) => pageOf(app, "settings"),
    header: ".settings-head h1",
    button: "#settings-close",
    empty: { x: 18, y: 0.5 },
  },
  {
    name: "permission",
    match: "permission.html",
    open: (app) =>
      app.evaluate(() => globalThis.blinklingTest.permissionGuide()),
    page: (app) => permissionPage(app),
    header: "main .blink",
    button: "#cancel",
    empty: { x: 12, y: 0.5 },
  },
];

for (const w of windows) {
  test(`${w.name}: moves from its header and from an empty area, keeps its buttons and stays on screen`, async () => {
    test.setTimeout(120000);
    const { app, page } = await launch();
    const rec = record(`firstwindows_${w.name}`, { suffix: "-326" });
    try {
      await background(app);
      await reveal(page);
      await w.open(app);
      await expect.poll(() => w.page(app)).toBeTruthy();
      await page.waitForTimeout(1000);
      const home = await boundsOf(app, w.match);
      const inPage = async (selector) => {
        const box = await w.page(app).locator(selector).first().boundingBox();
        const b = await boundsOf(app, w.match);
        return {
          x: b.x + box.x + box.width / 2,
          y: b.y + box.y + box.height / 2,
        };
      };
      rec.frame("home");
      // From the header.
      await drag(await inPage(w.header), -60, 40);
      const a = await boundsOf(app, w.match);
      expect([a.x - home.x, a.y - home.y], "dragged by the header").toEqual([
        -60, 40,
      ]);
      // From an empty area at the card's left padding.
      const empty = {
        x: a.x + w.empty.x + 10,
        y: a.y + a.height * w.empty.y,
      };
      await drag(empty, 80, 30);
      const b = await boundsOf(app, w.match);
      rec.frame("moved-from-empty-area");
      expect([b.x - a.x, b.y - a.y], "dragged by an empty area").toEqual([
        80, 30,
      ]);
      // A press on a button is the button's, not a drag.
      const before = await boundsOf(app, w.match);
      const button = await inPage(w.button);
      await drag(button, 30, 30);
      const after = await boundsOf(app, w.match);
      expect(
        [after.x - before.x, after.y - before.y],
        "a button stays",
      ).toEqual([0, 0]);
      // Dragged far, it stops at the work area.
      const area = await workArea(app);
      const start = await boundsOf(app, w.match);
      await drag(
        { x: start.x + w.empty.x + 10, y: start.y + start.height * 0.5 },
        -4000,
        -4000,
      );
      const far = await boundsOf(app, w.match);
      rec.frame("stopped-at-the-edge");
      expect(far.x).toBeGreaterThanOrEqual(area.x);
      expect(far.y).toBeGreaterThanOrEqual(area.y);
      expect(far.x + far.width).toBeLessThanOrEqual(area.x + area.width);
      expect(far.y + far.height).toBeLessThanOrEqual(area.y + area.height);
      expect(far.x, "all the way to the left").toBe(area.x);
      // Dragged back, it follows at once (no pointer travel is lost off screen).
      await drag(
        { x: far.x + w.empty.x + 10, y: far.y + far.height * 0.5 },
        50,
        50,
      );
      const back = await boundsOf(app, w.match);
      expect([back.x - far.x, back.y - far.y]).toEqual([50, 50]);
      rec.frame("followed-back");
    } finally {
      await rec.stop();
      await app.close();
    }
  });
}
