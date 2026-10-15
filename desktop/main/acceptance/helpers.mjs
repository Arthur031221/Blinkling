import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { move, click, report, bodyBox } from "./support.mjs";
export async function reveal(page, scale = 1) {
  await page.waitForFunction(() => window.desktop.inspect().anchor);
  await page.waitForTimeout(100);
  const point = await page.evaluate(() => {
    const rect = document.querySelector(".blink-body").getBoundingClientRect();
    return {
      x: Math.max(8, Math.min(innerWidth - 8, rect.x + rect.width * 0.35)),
      y: Math.max(8, Math.min(innerHeight - 8, rect.y + rect.height * 0.72)),
    };
  });
  move(point.x * scale, point.y * scale);
  await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
  await page.waitForTimeout(650);
  const active = await bodyBox(page);
  move(
    (active.x + active.width * 0.35) * scale,
    (active.y + active.height * 0.72) * scale,
  );
}
export async function clickButton(page, label, scale = 1) {
  const button = page.getByRole("button", { name: label, exact: true });
  await button.hover();
  await page.waitForTimeout(250);
  const r = await button.boundingBox();
  click((r.x + r.width / 2) * scale, (r.y + r.height / 2) * scale);
}
/** A real click on Blink's body: the one gesture that opens the composer (N5.1). */
export async function clickBlink(page, scale = 1) {
  const r = await bodyBox(page);
  click((r.x + r.width * 0.35) * scale, (r.y + r.height * 0.72) * scale);
}
/** The bubble for an action, whatever language the system speaks. */
export const bubble = (page, action) =>
  page.locator(`[data-action="${action}"]`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function background(app, fullscreen = false) {
  return app.evaluate(async ({ BrowserWindow, screen }, fullscreen) => {
    const bg = new BrowserWindow({
      ...screen.getPrimaryDisplay().bounds,
      frame: false,
      show: false,
      backgroundColor: "#204080",
    });
    await bg.loadURL(
      "data:text/html," +
        encodeURIComponent(
          '<body style="margin:0;background:#204080;color:white;font:24px sans-serif"><div style="padding:40px">Desktop focus target</div><script>window.clicks=[];addEventListener("click",e=>clicks.push([e.screenX,e.screenY]))</script>',
        ),
    );
    bg.show();
    if (fullscreen) bg.setFullScreen(true);
    globalThis.bg = bg;
    return screen.getPrimaryDisplay().workArea;
  }, fullscreen);
}
export async function shot(app, name, settle = 250) {
  await sleep(settle);
  const data = await app.evaluate(async ({ desktopCapturer, screen }) => {
    const b = screen.getPrimaryDisplay().bounds;
    return (
      await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.round(b.width * screen.getPrimaryDisplay().scaleFactor),
          height: Math.round(b.height * screen.getPrimaryDisplay().scaleFactor),
        },
      })
    )[0].thumbnail
      .toPNG()
      .toString("base64");
  });
  const bytes = Buffer.from(data, "base64");
  await writeFile(join(report, name + ".png"), bytes);
  return PNG.sync.read(bytes);
}
export const rgb = (p, x, y) => [
  ...p.data.subarray(
    (Math.round(y) * p.width + Math.round(x)) * 4,
    (Math.round(y) * p.width + Math.round(x)) * 4 + 3,
  ),
];
