import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { launch, nativeClick } from "./support.mjs";
const pixel = (image, x, y) =>
  Array.from(
    image.data.subarray(
      (y * image.width + x) * 4,
      (y * image.width + x) * 4 + 3,
    ),
  );
test("real compositor alpha, native click-through, clean capture and aligned overlay", async ({
  browserName,
}, info) => {
  expect(browserName).toBe("chromium");
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("img", { name: "Blink" })).toBeVisible();
    const bounds = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const bg = new BrowserWindow({
        ...screen.getPrimaryDisplay().bounds,
        frame: false,
        show: false,
        backgroundColor: "#204080",
      });
      await bg.loadURL(
        "data:text/html," +
          encodeURIComponent(
            '<body style="background:#204080;margin:0"><div style="position:absolute;left:400px;top:200px;width:100px;height:80px;background:red"></div><script>window.clicks=[];addEventListener("click",e=>clicks.push([e.screenX,e.screenY]))</script>',
          ),
      );
      bg.show();
      globalThis.testBackground = bg;
      return globalThis.glimpseletTest.blink.getBounds();
    });
    const shot = async (name) => {
      await new Promise((r) => setTimeout(r, 300));
      const base64 = await app.evaluate(async ({ desktopCapturer, screen }) => {
        const b = screen.getPrimaryDisplay().bounds;
        return (
          await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: b.width, height: b.height },
          })
        )[0].thumbnail
          .toPNG()
          .toString("base64");
      });
      const bytes = Buffer.from(base64, "base64");
      await writeFile(info.outputPath(name + ".png"), bytes);
      await info.attach(name, { body: bytes, contentType: "image/png" });
      return PNG.sync.read(bytes);
    };
    // Cursor stays away from Blink so the idle alpha is measured.
    nativeClick(50, 50);
    const alpha = await shot("alpha");
    expect(pixel(alpha, bounds.x + 5, bounds.y + 5)).toEqual([32, 64, 128]);
    const body = pixel(alpha, bounds.x + 90, bounds.y + 100);
    [44, 126, 137].forEach((v, i) =>
      expect(Math.abs(body[i] - v)).toBeLessThanOrEqual(3),
    );
    nativeClick(bounds.x + 5, bounds.y + 5);
    nativeClick(bounds.x + 90, bounds.y + 100);
    const clicks = await app.evaluate(async () => ({
      clicks:
        await globalThis.testBackground.webContents.executeJavaScript("clicks"),
      focus: globalThis.testBackground.isFocused(),
    }));
    expect(clicks.clicks).toEqual([
      [50, 50],
      [bounds.x + 5, bounds.y + 5],
    ]);
    expect(clicks.focus).toBe(true);
    const capture = await app.evaluate(() =>
      globalThis.glimpseletTest.capture(),
    );
    const clean = PNG.sync.read(Buffer.from(capture.image.data, "base64"));
    expect(pixel(clean, bounds.x + 90, bounds.y + 100)).toEqual([32, 64, 128]);
    await app.evaluate(() =>
      globalThis.glimpseletTest.overlay([
        { rect: { x: 400, y: 200, width: 100, height: 80 } },
      ]),
    );
    const overlay = await shot("overlay");
    expect(pixel(overlay, 400, 200)).toEqual([61, 220, 151]);
    expect(pixel(overlay, 450, 240)).toEqual([255, 0, 0]);
    nativeClick(450, 240);
    expect(
      await app.evaluate(() =>
        globalThis.testBackground.webContents.executeJavaScript(
          "clicks.at(-1)",
        ),
      ),
    ).toEqual([450, 240]);
  } finally {
    await app.close();
  }
});
