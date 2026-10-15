// Run on a real two-output RandR server with a compositor; deliberately fails
// on a single-display Xvfb instead of substituting mock display coordinates.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { expect } from "@playwright/test";
import { launch, reports, nativeBounds } from "./support.mjs";

for (const scale of [1, 1.5, 2]) {
  const { app, close } = await launch(scale);
  try {
    const displays = await app.evaluate(async ({ screen, BrowserWindow }) => {
      const displays = screen
        .getAllDisplays()
        .sort((a, b) => a.bounds.x - b.bounds.x);
      if (displays.length !== 2) throw Error("Two native outputs required");
      globalThis.b3MultiBackgrounds = [];
      for (const [i, d] of displays.entries()) {
        const w = new BrowserWindow({
          ...d.bounds,
          frame: false,
          backgroundColor: i ? "#1e5a50" : "#204080",
          show: false,
        });
        await w.loadURL(
          "data:text/html," +
            encodeURIComponent(
              `<body style="margin:0;background:${i ? "#1e5a50" : "#204080"};color:white;font:16px system-ui"><h1 style="margin:20px">Display ${i + 1}</h1><div style="position:absolute;left:100px;top:100px;width:120px;height:80px;background:#e84949;display:grid;place-items:center">Main result</div>`,
            ),
        );
        w.show();
        globalThis.b3MultiBackgrounds.push(w);
      }
      const owned = new BrowserWindow({
        x: displays[1].bounds.x + 20,
        y: 250,
        width: 100,
        height: 80,
        frame: false,
        transparent: true,
        show: false,
      });
      await owned.loadURL(
        "data:text/html,<body style='margin:0'><div style='height:100vh;background:yellow'>Owned composer</div></body>",
      );
      owned.showInactive();
      globalThis.b3MultiOwned = owned;
      const f = globalThis.blinklingTest.features;
      const original = f.capture.guard.windows;
      f.capture.guard.windows = () => [...original(), owned];
      const originalOverlay = f.overlay.windows;
      f.overlay.windows = () => [...originalOverlay(), owned];
      f.capture.onCapture = (c) => {
        globalThis.b3MultiCapture = c;
      };
      return displays.map((d) => ({
        id: String(d.id),
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
      }));
    });
    // Let the newly created real reference windows receive their first paint.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const blink = await app.firstWindow();
    const captures = [];
    for (const [i, display] of displays.entries()) {
      await app.evaluate(
        ({ screen }, id) =>
          globalThis.blinklingTest.setDisplay(
            screen.getAllDisplays().find((d) => String(d.id) === id),
          ),
        display.id,
      );
      await app.evaluate(() => {
        globalThis.b3MultiCapture = undefined;
      });
      // One pooled overlay per display, hidden until a capture asks for it.
      assert.deepEqual(
        await app.evaluate(() =>
          globalThis.blinklingTest.features.capture.overlays.windows.map((w) =>
            w.isVisible(),
          ),
        ),
        [false, false],
      );
      await blink.evaluate(() => void window.blinkling.action("capture"));
      // Enter with nothing picked takes the whole screen of Blink's display.
      await expect
        .poll(
          () =>
            app.evaluate(
              () =>
                globalThis.blinklingTest.features.capture.overlays.windows.filter(
                  (w) => w.isVisible(),
                ).length,
            ),
          { timeout: 10000 },
        )
        .toBe(1);
      let overlay;
      await expect
        .poll(async () => {
          // The pooled page that sits on the visible overlay window.
          const x = await app.evaluate(
            () =>
              globalThis.blinklingTest.features.capture.overlays.windows
                .find((w) => w.isVisible())
                ?.getBounds().x,
          );
          for (const page of app
            .windows()
            .filter((p) => /\/capture\/selection\.html$/.test(p.url())))
            if ((await page.evaluate(() => screenX)) === x) overlay = page;
          return !!overlay;
        })
        .toBe(true);
      await overlay.keyboard.press("Enter");
      await expect
        .poll(() => app.evaluate(() => !!globalThis.b3MultiCapture))
        .toBe(true);
      const capture = await app.evaluate(() => globalThis.b3MultiCapture);
      assert.equal(capture.kind, "screen");
      assert.equal(capture.display.id, display.id);
      const bytes = Buffer.from(capture.image.data, "base64"),
        image = PNG.sync.read(bytes);
      await writeFile(
        join(reports, `multi-capture-${scale}-${i + 1}.png`),
        bytes,
      );
      assert.equal(image.width, capture.pixelWidth);
      assert.equal(image.height, capture.pixelHeight);
      const point = (x, y) => {
        const p =
          (Math.floor((y * image.height) / display.bounds.height) *
            image.width +
            Math.floor((x * image.width) / display.bounds.width)) *
          4;
        return [...image.data.subarray(p, p + 3)];
      };
      // Compare excluded areas to an unoccluded pixel in this same capture.
      // Fractional thumbnail resampling can quantize the entire flat fill by
      // one channel value; own-window pixels must still match it exactly.
      const background = point(30, display.bounds.height - 30);
      assert.equal(
        background[2] > 100,
        i === 0,
        "the two native sources have different background colors",
      );
      assert.deepEqual(
        point(30, 270),
        background,
        "owned composer must be excluded",
      );
      assert.deepEqual(
        point(display.bounds.width - 90, display.bounds.height - 80),
        background,
        "Blink must be excluded",
      );
      const result = point(150, 150);
      assert.ok(
        result.every((channel, c) => Math.abs(channel - [232, 73, 73][c]) <= 3),
        `capture must include the red result on the Blink display: ${result}`,
      );
      captures.push({
        display: capture.display,
        pixelWidth: image.width,
        pixelHeight: image.height,
      });
      const opened = await app.evaluate(async () => {
        const f = globalThis.blinklingTest.features;
        await f.overlay.show(globalThis.b3MultiCapture, [
          {
            rect: { x: 20, y: 20, width: 260, height: 48 },
            label: "Screen purpose",
            steps: [0],
          },
          {
            rect: { x: 100, y: 100, width: 120, height: 80 },
            label: "Main result",
            steps: [0],
          },
        ]);
        globalThis.b3MultiDismiss = null;
        f.overlay.once(
          "dismissed",
          (reason) => (globalThis.b3MultiDismiss = reason),
        );
        globalThis.b3MultiOverlay = f.overlay.window;
        return {
          bounds: f.overlay.window.getBounds(),
          native: f.overlay.window.getNativeWindowHandle().readUInt32LE(0),
        };
      });
      console.log({ scale, display, shown: opened });
      assert.deepEqual(await nativeBounds(app, "b3MultiOverlay"), {
        x: i * 800,
        y: 0,
        width: 800,
        height: 900,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const shot = await app.evaluate(async ({ desktopCapturer }, d) => {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 800, height: 900 },
        });
        return sources
          .find((s) => s.display_id === d.id)
          .thumbnail.toPNG()
          .toString("base64");
      }, display);
      const overlayPNG = PNG.sync.read(Buffer.from(shot, "base64"));
      const sx = overlayPNG.width / display.bounds.width,
        sy = overlayPNG.height / display.bounds.height;
      const index =
        (Math.round(140 * sy) * overlayPNG.width + Math.round(100 * sx)) * 4;
      assert.deepEqual(
        [...overlayPNG.data.subarray(index, index + 3)],
        [61, 220, 151],
        "native guide border must align with captured content",
      );
      await writeFile(
        join(reports, `multi-guide-${scale}-${i + 1}.png`),
        Buffer.from(shot, "base64"),
      );
      if (i === 1) {
        execFileSync("xrandr", ["--output", "DUMMY1", "--mode", "800x600"]);
        await expect
          .poll(() =>
            app.evaluate(
              () => !!globalThis.blinklingTest.features.overlay.capture,
            ),
          )
          .toBe(false);
        execFileSync("xrandr", ["--output", "DUMMY1", "--mode", "800x900"]);
        await expect
          .poll(() =>
            app.evaluate(
              ({ screen }, id) =>
                screen.getAllDisplays().find((d) => String(d.id) === id)?.bounds
                  .height,
              display.id,
            ),
          )
          .toBe(display.bounds.height);
      } else
        await app.evaluate(() =>
          globalThis.blinklingTest.features.overlay.dismiss(),
        );
    }
    await writeFile(
      join(reports, `multi-displays-${scale}.json`),
      JSON.stringify(captures, null, 2),
    );
    console.log(
      `PASS native two-display capture, exclusion, alignment and display invalidation at ${scale}`,
    );
  } finally {
    execFileSync("xrandr", ["--output", "DUMMY1", "--mode", "800x900"]);
    await close();
  }
}
