import { PNG } from "pngjs";
import { _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const desktop = fileURLToPath(new URL("../..", import.meta.url));

/** Starts the real shell and waits for its locator hook. */
export async function launch({ env = {} } = {}) {
  const app = await electron.launch({
    args: [desktop, "--no-sandbox"],
    env: {
      ...process.env,
      BLINKLING_E2E: "1",
      // Automated runs never create Remote Control sessions.
      BLINKLING_REMOTE: "0",
      BLINKLING_TEST_SESSION: "manual",
      ...env,
    },
  });
  const end = Date.now() + 20000;
  while (
    !(await app.evaluate(() => Boolean(globalThis.blinklingTest?.locator)))
  ) {
    if (Date.now() > end)
      throw new Error("Timed out waiting for the locator hook");
    await new Promise((r) => setTimeout(r, 40));
  }
  return app;
}

/** A screenshot of the whole composited screen, taken by the app itself: the
 * X root window stays black under a compositing window manager. */
export async function shot(app, file) {
  const base64 = await app.evaluate(async ({ desktopCapturer, screen }) => {
    const { size, scaleFactor } = screen.getPrimaryDisplay();
    const [source] = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(size.width * scaleFactor),
        height: Math.round(size.height * scaleFactor),
      },
    });
    return source.thumbnail.toPNG().toString("base64");
  });
  const png = Buffer.from(base64, "base64");
  writeFileSync(file, png);
  return png;
}

/** Bounding box (screen pixels) of every pixel within `tolerance` of `rgb`,
 * or null. Ground truth for where a solid-colour block really is on screen. */
export function findColour(file, rgb, tolerance = 6) {
  const { width, height, data } = PNG.sync.read(file);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        Math.abs(data[i] - rgb[0]) <= tolerance &&
        Math.abs(data[i + 1] - rgb[1]) <= tolerance &&
        Math.abs(data[i + 2] - rgb[2]) <= tolerance
      ) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0
    ? null
    : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export const centre = (r) => ({
  x: Math.round(r.x + r.width / 2),
  y: Math.round(r.y + r.height / 2),
});

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

/** Hover `points` in turn inside the app and time every locate(). Pauses
 * between hovers so a cache entry goes stale and is refreshed mid-run. */
export function hoverRun(app, points, pauseMs = 40) {
  return app.evaluate(
    async (_, { points, pauseMs }) => {
      const { locator } = globalThis.blinklingTest;
      const times = [];
      const results = [];
      const lags = [];
      let last = performance.now();
      let worst = 0;
      const watch = setInterval(() => {
        const now = performance.now();
        worst = Math.max(worst, now - last - 5);
        last = now;
      }, 5);
      for (const point of points) {
        worst = 0;
        const t0 = performance.now();
        const element = await locator.locate(point);
        times.push(performance.now() - t0);
        lags.push(worst);
        results.push(
          element && {
            kind: element.kind,
            id: element.id,
            bounds: element.bounds,
          },
        );
        await new Promise((r) => setTimeout(r, pauseMs));
      }
      clearInterval(watch);
      return { times, results, lags };
    },
    { points, pauseMs },
  );
}

/** Draws a 2 px outline for each rect on a PNG and returns the new PNG. */
export function outline(file, rects, rgb = [255, 120, 0]) {
  const png = PNG.sync.read(file);
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const i = (y * png.width + x) * 4;
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  };
  for (const r of rects) {
    const x0 = Math.round(r.x);
    const y0 = Math.round(r.y);
    const x1 = Math.round(r.x + r.width) - 1;
    const y1 = Math.round(r.y + r.height) - 1;
    for (let t = 0; t < 2; t++) {
      for (let x = x0; x <= x1; x++) {
        set(x, y0 + t);
        set(x, y1 - t);
      }
      for (let y = y0; y <= y1; y++) {
        set(x0 + t, y);
        set(x1 - t, y);
      }
    }
  }
  return PNG.sync.write(png);
}
