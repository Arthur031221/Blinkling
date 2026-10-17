import { test, expect } from "@playwright/test";
import { launch, native } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const pageOf = (app, name) =>
  app.windows().find((p) => p.url().includes(`/${name}/index.html`));
const boundsOf = (app, name) =>
  app.evaluate(
    ({ BrowserWindow }, name) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes(`/${name}/index.html`))
        .getBounds(),
    name,
  );

/** Drags a panel by its header and gives its window a moment to follow. */
async function dragHead(app, name, selector, dx, dy) {
  const head = await pageOf(app, name).locator(selector).boundingBox();
  const b = await boundsOf(app, name);
  const from = { x: b.x + head.x + 24, y: b.y + head.y + head.height / 2 };
  const steps = 8;
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
  await new Promise((r) => setTimeout(r, 400));
}

const panels = [
  ["settings", ".settings-head h1", "settings"],
  ["welcome", ".welcome-head", "welcome"],
];

test("a window opened from the chat (settings, welcome) can be dragged by its header up to 120 px, is remembered, and a double click puts it back", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("panel_nudge", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    for (const [name, head, hook] of panels) {
      await app.evaluate(
        (_, hook) => globalThis.blinklingTest[hook].open(),
        hook,
      );
      await expect.poll(() => pageOf(app, name)).toBeTruthy();
      await page.waitForTimeout(900);
      const home = await boundsOf(app, name);
      rec.frame(`${name}-home`);
      await dragHead(app, name, head, -60, 40);
      const moved = await boundsOf(app, name);
      rec.frame(`${name}-moved`);
      expect([moved.x - home.x, moved.y - home.y]).toEqual([-60, 40]);
      await dragHead(app, name, head, -500, -400);
      const far = await boundsOf(app, name);
      rec.frame(`${name}-limit`);
      const reach = Math.hypot(far.x - home.x, far.y - home.y);
      expect(reach).toBeLessThanOrEqual(120.5);
      expect(reach).toBeGreaterThan(110);
      // Closed and opened again, it opens where it was left.
      await app.evaluate(
        (_, hook) => globalThis.blinklingTest[hook].close(),
        hook,
      );
      await page.waitForTimeout(700);
      await app.evaluate(
        (_, hook) => globalThis.blinklingTest[hook].open(),
        hook,
      );
      await page.waitForTimeout(900);
      const again = await boundsOf(app, name);
      expect([again.x, again.y]).toEqual([far.x, far.y]);
      // A double click on the header puts it back.
      const h = await pageOf(app, name).locator(head).boundingBox();
      const b = await boundsOf(app, name);
      const at = { x: b.x + h.x + 24, y: b.y + h.y + h.height / 2 };
      native([
        { type: "move", ...at },
        { type: "down" },
        { type: "up" },
        { type: "down" },
        { type: "up" },
      ]);
      await expect
        .poll(async () => {
          const c = await boundsOf(app, name);
          return [c.x - home.x, c.y - home.y];
        })
        .toEqual([0, 0]);
      rec.frame(`${name}-reset`);
      // Dragging and double clicking the header must not select its title.
      expect(
        await pageOf(app, name).evaluate(() =>
          String(window.getSelection()).trim(),
        ),
        `${name}: nothing selected`,
      ).toBe("");
      await app.evaluate(
        (_, hook) => globalThis.blinklingTest[hook].close(),
        hook,
      );
      await page.waitForTimeout(700);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
