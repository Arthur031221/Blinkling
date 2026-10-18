import { test, expect } from "@playwright/test";
import { launch, move } from "./support.mjs";
import { background } from "./helpers.mjs";
import { record } from "./record.mjs";

const inside = (box, shape) =>
  shape.some(
    (r) =>
      box.x >= r.x &&
      box.y >= r.y &&
      box.x + box.width <= r.x + r.width &&
      box.y + box.height <= r.y + r.height,
  );
const shapeOnWindows = (app) =>
  app.evaluate(() => globalThis.blinklingTest.shapeFor("win32"));

test("the progress bubble and the grumble bubble are in the shape Windows clips Blink's window to, at rest and after they go", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("win_bubbles", { suffix: "-324" });
  try {
    await background(app);
    move(20, 20);
    await page.waitForTimeout(1500);
    const status = page.locator("#status"),
      grumble = page.locator("#grumble");
    // The progress line a full page read says while it works.
    await page.evaluate(() => {
      const node = document.querySelector("#status");
      node.textContent = "Reading the whole page...";
      node.dataset.shown = "true";
    });
    await expect
      .poll(async () => (await status.boundingBox())?.width)
      .toBeGreaterThan(40);
    await page.waitForTimeout(400);
    rec.frame("progress");
    const progress = await status.boundingBox();
    expect(
      inside(progress, await shapeOnWindows(app)),
      "the progress bubble is in the Windows shape",
    ).toBe(true);
    await page.evaluate(() => {
      document.querySelector("#status").dataset.shown = "false";
      window.desktop.grumbler.touch(performance.now() - 61_000);
    });
    await expect(grumble).toHaveAttribute("data-shown", "true");
    await page.waitForTimeout(1200);
    rec.frame("grumble");
    const box = await grumble.boundingBox();
    expect(
      inside(box, await shapeOnWindows(app)),
      "the grumble bubble is in the Windows shape",
    ).toBe(true);
    // Elsewhere the shape stays Blink's own.
    const other = await app.evaluate(() =>
      globalThis.blinklingTest.shapeFor("linux"),
    );
    expect(inside(box, other), "no bubble in the shape on Linux").toBe(false);
    await expect(grumble).toHaveAttribute("data-shown", "false", {
      timeout: 15000,
    });
    await page.waitForTimeout(800);
    // What Blink wears is drawn outside its body and is in the Windows shape too,
    // so the shape is not compared by size: the places the bubbles stood are.
    const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const covers = (shape, b) =>
      shape.some(
        (r) =>
          centre(b).x >= r.x &&
          centre(b).y >= r.y &&
          centre(b).x <= r.x + r.width &&
          centre(b).y <= r.y + r.height,
      );
    const windows = await shapeOnWindows(app);
    const body = await app.evaluate(() =>
      globalThis.blinklingTest.shapeFor("linux"),
    );
    for (const b of [progress, box])
      expect(
        covers(windows, b),
        "the bubbles leave the shape once they have faded",
      ).toBe(covers(body, b));
    await rec.stop();
  } finally {
    await app.close();
  }
});
