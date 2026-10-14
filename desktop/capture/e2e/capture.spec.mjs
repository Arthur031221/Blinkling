import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { writeFile } from "node:fs/promises";
import {
  launch,
  background,
  desktopShot,
  nextWindow,
  native,
  reports,
} from "./support.mjs";
const pixel = (png, x, y) =>
  Array.from(
    png.data.subarray(
      (Math.round(y) * png.width + Math.round(x)) * 4,
      (Math.round(y) * png.width + Math.round(x)) * 4 + 3,
    ),
  );
test("holding native Shift over Blink starts selection without keyboard focus", async () => {
  const { app, close } = await launch();
  try {
    const { blink } = await background(app);
    native(30, 30);
    expect(await app.evaluate(() => globalThis.b3Background.isFocused())).toBe(
      true,
    );
    native(blink.x + 5, blink.y + 5, [0xffe1], { hover: true });
    expect(
      await app.evaluate(() => globalThis.blinklingTest.features.capture.busy),
    ).toBe(false);
    const point = await (
      await app.firstWindow()
    ).evaluate(() => {
      const r = document
        .querySelector('rect[fill="#3ddc97"]')
        .getBoundingClientRect();
      return {
        x: Math.min(innerWidth - 8, r.x + r.width * 0.35),
        y: r.y + r.height * 0.72,
      };
    });
    const selector = await nextWindow(app, () =>
      native(blink.x + point.x, blink.y + point.y, [0xffe1], { hover: true }),
    );
    await expect(selector.locator("body")).toHaveAttribute(
      "data-ready",
      "true",
    );
    expect(
      await app.evaluate(() => globalThis.blinklingTest.blink.isFocusable()),
    ).toBe(false);
    native(30, 30, [0xff1b]);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.features.capture.busy),
      )
      .toBe(false);
    await expect
      .poll(() => app.evaluate(() => globalThis.b3Background.isFocused()))
      .toBe(true);
  } finally {
    await close();
  }
});
for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"])
    test(`native region capture Enter/Esc exclusion at ${scale} ${theme}`, async () => {
      const { app, close } = await launch(scale);
      try {
        const blink = await app.firstWindow();
        const d = await background(app);
        native(30, 30);
        await blink.evaluate(() => {
          window.captures = [];
          window.blinkling.onEvent((e) => {
            if (e.type === "capture") window.captures.push(e.capture);
          });
        });
        const selector = await nextWindow(app, () =>
          blink.evaluate(() => {
            void window.blinkling.action("region");
          }),
        );
        await selector.emulateMedia({ colorScheme: theme });
        await expect(selector.locator("body")).toHaveAttribute(
          "data-ready",
          "true",
        );
        expect(
          await app.evaluate(() => globalThis.blinklingTest.blink.isVisible()),
        ).toBe(false);
        expect(await selector.evaluate(() => typeof window.require)).toBe(
          "undefined",
        );
        await expect(
          selector.evaluate(() =>
            window.captureUI.finish({ x: -1, y: 0, width: 10, height: 10 }),
          ),
        ).rejects.toThrow(/Invalid capture region/);
        await selector.mouse.move(240, 160);
        await selector.mouse.down();
        await selector.mouse.move(400, 260, { steps: 24 });
        await selector.mouse.up();
        await expect(selector.locator("#size")).toHaveText("160 × 100");
        const metrics = await selector.evaluate(() =>
          [...document.querySelectorAll("#hint,#size")].map((el) => {
            const r = el.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              scroll: el.scrollWidth,
              client: el.clientWidth,
            };
          }),
        );
        for (const m of metrics) {
          expect(m.x).toBeGreaterThanOrEqual(0);
          expect(m.right).toBeLessThanOrEqual(d.bounds.width);
          expect(m.bottom).toBeLessThanOrEqual(d.bounds.height);
          expect(m.scroll).toBeLessThanOrEqual(m.client);
        }
        await desktopShot(app, `selection-${scale}-${theme}`);
        native(50, 50, [0xff0d]);
        await expect
          .poll(() => blink.evaluate(() => window.captures.length))
          .toBe(1);
        const capture = await blink.evaluate(() => window.captures[0]);
        expect(capture.region).toEqual({
          x: 240,
          y: 160,
          width: 160,
          height: 100,
        });
        const png = PNG.sync.read(Buffer.from(capture.image.data, "base64"));
        expect(png.width).toBeGreaterThanOrEqual(Math.floor(160 * scale));
        expect(png.height).toBeGreaterThanOrEqual(Math.floor(100 * scale));
        expect(pixel(png, 10, 10)).toEqual([232, 73, 73]);
        await writeFile(
          `${reports}/cropped-${scale}-${theme}.png`,
          Buffer.from(capture.image.data, "base64"),
        );
        expect(
          await app.evaluate(() => globalThis.blinklingTest.blink.isVisible()),
        ).toBe(true);
        const cancelled = await nextWindow(app, () =>
          blink.evaluate(() => {
            void window.blinkling.action("region");
          }),
        );
        await expect(cancelled.locator("body")).toHaveAttribute(
          "data-ready",
          "true",
        );
        native(50, 50, [0xff1b]);
        await expect
          .poll(() =>
            app.evaluate(() => globalThis.blinklingTest.features.capture.busy),
          )
          .toBe(false);
        expect(await blink.evaluate(() => window.captures.length)).toBe(1);
        expect(
          await app.evaluate(() => globalThis.blinklingTest.blink.isVisible()),
        ).toBe(true);
        await expect
          .poll(() => app.evaluate(() => globalThis.b3Background.isFocused()))
          .toBe(true);
        // All owned surfaces disappear in whole-screen pixels, including an existing drawing layer.
        await app.evaluate(() =>
          globalThis.blinklingTest.overlay([
            { rect: { x: 240, y: 160, width: 160, height: 100 } },
          ]),
        );
        const clean = await app.evaluate(({ screen }) =>
          globalThis.blinklingTest.features.capture.screen(
            String(screen.getPrimaryDisplay().id),
          ),
        );
        const image = PNG.sync.read(Buffer.from(clean.image.data, "base64"));
        const sx = image.width / d.bounds.width,
          sy = image.height / d.bounds.height;
        expect(
          pixel(image, d.blink.x * sx + 90 * sx, d.blink.y * sy + 100 * sy),
        ).toEqual([32, 64, 128]);
        expect(pixel(image, 240 * sx, 160 * sy)).toEqual([232, 73, 73]);
      } finally {
        await close();
      }
    });
test("global shortcut selects the whole desktop, abort restores focus and excludes temporary windows", async () => {
  const { app, close } = await launch();
  try {
    await app.firstWindow();
    await background(app);
    const selector = await nextWindow(app, async () =>
      native(50, 50, [0xffe3, 0xffe1, 115]),
    );
    await expect(selector.locator("body")).toHaveAttribute(
      "data-ready",
      "true",
    );
    expect(await selector.evaluate(() => [innerWidth, innerHeight])).toEqual([
      1280, 800,
    ]);
    await app.evaluate(() =>
      globalThis.blinklingTest.features.capture.cancel(),
    );
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.features.capture.busy),
      )
      .toBe(false);
    await expect
      .poll(() => app.evaluate(() => globalThis.b3Background.isFocused()))
      .toBe(true);
  } finally {
    await close();
  }
});

for (const [name, handler] of [
  ["never settles", "() => new Promise(() => {})"],
  ["throws", "async () => { throw Error('card window is gone'); }"],
]) {
  test(`H-7 capture busy clears when the card handler ${name}`, async () => {
    const { app, close } = await launch();
    try {
      await app.firstWindow();
      await background(app);
      const outcome = await app.evaluate(async ({ screen }, source) => {
        const capture = globalThis.blinklingTest.features.capture;
        capture.onCapture = (0, eval)(`(${source})`);
        capture.limits.delivery = 300;
        const id = String(screen.getPrimaryDisplay().id);
        const error = await capture.screen(id).then(
          () => null,
          (e) => e.code ?? e.message,
        );
        const busy = capture.busy;
        const next = await capture.screen(id).then(
          () => "ok",
          (e) => e.code ?? e.message,
        );
        return { error, busy, next, after: capture.busy };
      }, handler);
      expect(outcome.busy).toBe(false);
      expect(outcome.after).toBe(false);
      expect(outcome.error).toBe(
        name === "throws" ? "card window is gone" : "CAPTURE_DELIVERY_TIMEOUT",
      );
      // The next capture is not refused with CAPTURE_BUSY.
      expect(outcome.next).not.toBe("CAPTURE_BUSY");
    } finally {
      await close();
    }
  });
}
test("H-7 busy is already clear while a slow card handler is still working", async () => {
  const { app, close } = await launch();
  try {
    await app.firstWindow();
    await background(app);
    const busyDuringDelivery = await app.evaluate(async ({ screen }) => {
      const capture = globalThis.blinklingTest.features.capture;
      let seen;
      capture.onCapture = async () => {
        seen = capture.busy;
      };
      await capture.screen(String(screen.getPrimaryDisplay().id));
      return seen;
    });
    expect(busyDuringDelivery).toBe(false);
  } finally {
    await close();
  }
});
