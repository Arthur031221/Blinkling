import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  launch,
  background,
  desktopShot,
  native,
  reports,
  spawnWindow,
  overlayPage,
  openOverlay,
  collectTaken,
  taken,
  recordLuminance,
} from "./support.mjs";
const pixel = (png, x, y) =>
  Array.from(
    png.data.subarray(
      (Math.round(y) * png.width + Math.round(x)) * 4,
      (Math.round(y) * png.width + Math.round(x)) * 4 + 3,
    ),
  );
const idle = (app) =>
  expect
    .poll(() =>
      app.evaluate(() => globalThis.blinklingTest.features.capture.busy),
    )
    .toBe(false);
const overlaysVisible = (app) =>
  app.evaluate(() =>
    globalThis.blinklingTest.features.capture.overlays.windows.map((w) =>
      w.isVisible(),
    ),
  );
const A = {
  x: 80,
  y: 330,
  width: 420,
  height: 300,
  color: "#d6dde6",
  title: "Window A",
};
const B = {
  x: 620,
  y: 180,
  width: 420,
  height: 340,
  color: "#e9a23b",
  title: "Window B",
};
const centre = (w) => ({ x: w.x + w.width / 2, y: w.y + w.height / 2 });
// Two real windows of another application, found by the capture service.
async function twoWindows(app, dir, extra = {}) {
  const specs = [
    { ...A, ...extra.a },
    { ...B, ...extra.b },
  ];
  const a = await spawnWindow(specs[0], dir);
  const b = await spawnWindow(specs[1], dir);
  await expect
    .poll(
      () =>
        app.evaluate(async ({ screen }) => {
          const c = globalThis.blinklingTest.features.capture;
          const list = await c.list(
            c.display(String(screen.getPrimaryDisplay().id)),
          );
          return list.map((w) => w.title).sort();
        }),
      { timeout: 15000 },
    )
    .toEqual(specs.map((w) => w.title).sort());
  return { a, b, close: () => (a.close(), b.close()) };
}
const fakeCompanion = (app, connected) =>
  app.evaluate((_electron, connected) => {
    const c = globalThis.blinklingTest.features.capture;
    c.companion = () => connected;
    c.fullPage = async () => ({
      tiles: [
        {
          image: {
            id: "t1",
            name: "Page.png",
            mediaType: "image/png",
            data: "AAAA",
          },
          region: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
    });
  }, connected);
async function withApp(options, body) {
  const [scale, settings] = Array.isArray(options) ? options : [options];
  const { app, close } = await launch(scale, settings);
  const dir = await mkdtemp(join(tmpdir(), "glimpse-win-"));
  try {
    await body({ app, dir });
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("overlays are created hidden at start, one per display, and reused", async () => {
  await withApp(1, async ({ app }) => {
    const blink = await app.firstWindow();
    await background(app);
    const ids = () =>
      app.evaluate(() =>
        globalThis.blinklingTest.features.capture.overlays.windows.map(
          (w) => w.id,
        ),
      );
    const displays = await app.evaluate(
      ({ screen }) => screen.getAllDisplays().length,
    );
    const first = await ids();
    expect(first).toHaveLength(displays);
    expect(await overlaysVisible(app)).toEqual(first.map(() => false));
    const state = await app.evaluate(() =>
      globalThis.blinklingTest.features.capture.overlays.windows.map((w) => ({
        focusable: w.isFocusable(),
        transparent: w.getBackgroundColor(),
      })),
    );
    expect(state.every((s) => /^#0{6}(0{2})?$/i.test(s.transparent))).toBe(
      true,
    );
    for (let round = 0; round < 2; round++) {
      await openOverlay(app, blink);
      expect(await overlaysVisible(app)).toContain(true);
      expect(await ids()).toEqual(first);
      await overlayPage(app).keyboard.press("Escape");
      await idle(app);
      await expect
        .poll(() => overlaysVisible(app))
        .toEqual(first.map(() => false));
      expect(await ids()).toEqual(first);
    }
  });
});

test("holding native Shift over Blink does nothing", async () => {
  await withApp(1, async ({ app }) => {
    const { blink } = await background(app);
    native(30, 30);
    const page = await app.firstWindow();
    const point = await page.evaluate(() => {
      const r = document
        .querySelector('rect[fill="#3ddc97"]')
        .getBoundingClientRect();
      return {
        x: Math.min(innerWidth - 8, r.x + r.width * 0.35),
        y: r.y + r.height * 0.72,
      };
    });
    native(blink.x + point.x, blink.y + point.y, [0xffe1], { hover: true });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(
      await app.evaluate(() => globalThis.blinklingTest.features.capture.busy),
    ).toBe(false);
    expect(await overlaysVisible(app)).toEqual([false]);
    expect(await app.evaluate(() => globalThis.b3Background.isFocused())).toBe(
      true,
    );
  });
});

test("window pick: hover highlights, click takes the window, drag takes an area, Enter the screen, Esc cancels", async () => {
  await withApp(1, async ({ app, dir }) => {
    const blink = await app.firstWindow();
    await background(app);
    await collectTaken(app);
    const windows = await twoWindows(app, dir);
    try {
      // Hover, with the pointer already over a window when the overlay opens.
      native(centre(A).x, centre(A).y);
      const page = await openOverlay(app, blink);
      const on = () =>
        page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() =>
                resolve(document.querySelector(".win.on")?.dataset.id ?? null),
              ),
            ),
        );
      const first = await on();
      expect(first).not.toBeNull();
      await page.mouse.move(centre(B).x, centre(B).y);
      const second = await on();
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
      await page.mouse.move(10, 10);
      expect(await on()).toBeNull();
      await page.mouse.move(centre(A).x, centre(A).y);
      expect(await on()).toBe(first);
      await desktopShot(app, "window-pick-hover");
      // A click is a window, with that window's bounds.
      await page.mouse.down();
      await page.mouse.up();
      await expect.poll(() => taken(app).then((t) => t.length)).toBe(1);
      let [t] = await taken(app);
      expect(t.kind).toBe("window");
      expect(t.source).toBe("capture");
      expect(t.region).toEqual({
        x: A.x,
        y: A.y,
        width: A.width,
        height: A.height,
      });
      await idle(app);
      // A press that wanders 5 px is still a click; past 6 px it is a drag.
      await openOverlay(app, blink);
      await page.mouse.move(centre(B).x, centre(B).y);
      await page.mouse.down();
      await page.mouse.move(centre(B).x + 5, centre(B).y);
      await page.mouse.up();
      await expect.poll(() => taken(app).then((t) => t.length)).toBe(2);
      expect((await taken(app))[1].kind).toBe("window");
      await idle(app);
      await openOverlay(app, blink);
      await page.mouse.move(150, 360);
      await page.mouse.down();
      await page.mouse.move(150 + 7, 360, { steps: 3 });
      await page.mouse.move(150 + 120, 360 + 80, { steps: 12 });
      await desktopShot(app, "window-pick-drag");
      await page.mouse.up();
      await expect.poll(() => taken(app).then((t) => t.length)).toBe(3);
      [, , t] = await taken(app);
      expect(t.kind).toBe("area");
      expect(t.region).toEqual({ x: 150, y: 360, width: 120, height: 80 });
      await idle(app);
      // Enter with nothing picked takes Blink's whole display.
      await openOverlay(app, blink);
      await page.keyboard.press("Enter");
      await expect.poll(() => taken(app).then((t) => t.length)).toBe(4);
      t = (await taken(app))[3];
      expect(t.kind).toBe("screen");
      const display = await app.evaluate(
        ({ screen }) => screen.getPrimaryDisplay().bounds,
      );
      expect(t.region).toEqual({
        x: 0,
        y: 0,
        width: display.width,
        height: display.height,
      });
      await idle(app);
      // Esc cancels: nothing is delivered and the overlay goes away.
      await openOverlay(app, blink);
      await page.keyboard.press("Escape");
      await idle(app);
      await expect.poll(() => overlaysVisible(app)).toEqual([false]);
      expect(await taken(app)).toHaveLength(4);
    } finally {
      windows.close();
    }
  });
});

test("the 整頁 chip needs a browser window and a connected companion, and delivers a page", async () => {
  await withApp(1, async ({ app, dir }) => {
    const blink = await app.firstWindow();
    await background(app);
    await collectTaken(app);
    await blink.evaluate(() => {
      window.events = [];
      window.blinkling.onEvent((e) => window.events.push(e));
    });
    const windows = await twoWindows(app, dir, {
      a: { title: "Docs - Google Chrome" },
    });
    const chip = (page) => page.locator("#chip.on");
    try {
      await fakeCompanion(app, true);
      const page = await openOverlay(app, blink);
      await page.mouse.move(centre(B).x, centre(B).y);
      await expect(chip(page)).toHaveCount(0);
      await page.mouse.move(centre(A).x, centre(A).y);
      await expect(chip(page)).toHaveCount(1);
      await expect(chip(page)).toHaveText(/^(整頁|Full page)$/);
      const box = await page.locator("#chip").boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(A.x);
      expect(box.x + box.width).toBeLessThanOrEqual(A.x + A.width);
      expect(box.y).toBeGreaterThanOrEqual(A.y);
      expect(box.y + box.height).toBeLessThanOrEqual(A.y + A.height);
      await desktopShot(app, "window-pick-chip");
      await page.locator("#chip").click();
      await expect.poll(() => taken(app).then((t) => t.length)).toBe(1);
      const [t] = await taken(app);
      expect(t.kind).toBe("page");
      expect(t.source).toBe("page");
      await idle(app);
      // Without a connected companion: no chip, no notice, and a click on the
      // browser is a plain window capture.
      await fakeCompanion(app, false);
      const again = await openOverlay(app, blink);
      await again.mouse.move(centre(A).x, centre(A).y);
      await expect(chip(again)).toHaveCount(0);
      await again.mouse.down();
      await again.mouse.up();
      await expect.poll(() => taken(app).then((t) => t.length)).toBe(2);
      expect((await taken(app))[1].kind).toBe("window");
      await idle(app);
      const events = await blink.evaluate(() => window.events);
      expect(
        events.filter((e) => e.type === "companion-required" || e.message),
      ).toEqual([]);
      expect(
        await app.evaluate(
          () =>
            globalThis.blinklingTest.bubbles.isDestroyed() ||
            !globalThis.blinklingTest.bubbles.isVisible(),
        ),
      ).toBe(true);
    } finally {
      windows.close();
    }
  });
});

for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"])
    test(`area capture and exclusion of own windows at ${scale} ${theme}`, async () => {
      await withApp(scale, async ({ app }) => {
        const blink = await app.firstWindow();
        const d = await background(app);
        native(30, 30);
        await blink.evaluate(() => {
          window.captures = [];
          window.blinkling.onEvent((e) => {
            if (e.type === "capture") window.captures.push(e.capture);
          });
        });
        const selector = await openOverlay(app, blink);
        await selector.emulateMedia({ colorScheme: theme });
        expect(await selector.evaluate(() => typeof window.require)).toBe(
          "undefined",
        );
        await expect(
          selector.evaluate(() =>
            window.captureUI.finish({
              kind: "area",
              rect: { x: -1, y: 0, width: 10, height: 10 },
            }),
          ),
        ).rejects.toThrow(/Invalid capture/);
        await selector.mouse.move(240, 160);
        await selector.mouse.down();
        await selector.mouse.move(400, 260, { steps: 24 });
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
        await selector.mouse.up();
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
        await idle(app);
        expect(
          await app.evaluate(() => globalThis.blinklingTest.blink.isVisible()),
        ).toBe(true);
        await expect.poll(() => overlaysVisible(app)).toEqual([false]);
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
      });
    });

for (const scale of [1, 2])
  for (const theme of ["light", "dark"])
    test(`opening and closing the overlay never darkens the screen at ${scale} ${theme}`, async () => {
      await withApp(scale, async ({ app }) => {
        const blink = await app.firstWindow();
        await app.evaluate(({ nativeTheme }, theme) => {
          nativeTheme.themeSource = theme;
        }, theme);
        await background(app, theme === "light" ? "#e8edf3" : "#1b2026");
        const baseline = (await recordLuminance(async () => {})).slice(5);
        expect(baseline.length).toBeGreaterThan(10);
        const screenLuma = [...baseline].sort((a, b) => a - b)[
          Math.floor(baseline.length / 2)
        ];
        const frames = await recordLuminance(async () => {
          const page = await openOverlay(app, blink);
          await new Promise((resolve) => setTimeout(resolve, 500));
          await page.keyboard.press("Escape");
          await idle(app);
          await expect.poll(() => overlaysVisible(app)).toEqual([false]);
        });
        expect(frames.length).toBeGreaterThan(30);
        await writeFile(
          `${reports}/frames-${scale}-${theme}.json`,
          JSON.stringify({ screenLuma, frames }),
        );
        // The recorded open, held and close frames never fall below the screen.
        expect(Math.min(...frames)).toBeGreaterThanOrEqual(screenLuma - 1.5);
      });
    });

test("capturing the screen fades own windows in place: none is hidden or moved", async () => {
  await withApp(1, async ({ app }) => {
    await app.firstWindow();
    await background(app);
    const result = await app.evaluate(async ({ screen }) => {
      const t = globalThis.blinklingTest;
      const own = () =>
        [t.blink, t.bubbles, t.composer].filter((w) => w && !w.isDestroyed());
      const known = own();
      const state = () => known.map((w) => [w.isVisible(), w.getBounds()]);
      const before = state();
      const seen = [];
      const timer = setInterval(() => seen.push(state()), 4);
      await t.features.capture.screen(String(screen.getPrimaryDisplay().id));
      clearInterval(timer);
      const after = state();
      return { before, seen, after };
    });
    expect(result.seen.length).toBeGreaterThan(5);
    for (const frame of result.seen) expect(frame).toEqual(result.before);
    expect(result.after).toEqual(result.before);
  });
});

test("the default hotkey opens the overlay, a clash is refused, and a new key replaces the old", async () => {
  await withApp(1, async ({ app }) => {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    const features = (fn, ...args) =>
      app.evaluate(
        (_e, [fn, args]) =>
          (0, eval)(fn)(globalThis.blinklingTest.features, ...args),
        [fn, args],
      );
    expect(await features("(f) => f.hotkey")).toBe("Alt+Shift+X");
    const alt = 0xffe9,
      shift = 0xffe1;
    native(50, 50, [alt, shift, 0x78]);
    await expect.poll(() => overlaysVisible(app)).toEqual([true]);
    await overlayPage(app).keyboard.press("Escape");
    await idle(app);
    expect(await features("(f) => f.setHotkey('Control+Shift+S')")).toEqual({
      ok: false,
      reason: "clash",
    });
    expect(await features("(f) => f.setHotkey('Shift+')")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await features("(f) => f.hotkey")).toBe("Alt+Shift+X");
    native(50, 50, [alt, shift, 0x78]);
    await expect.poll(() => overlaysVisible(app)).toEqual([true]);
    await overlayPage(app).keyboard.press("Escape");
    await idle(app);
    expect(await features("(f) => f.setHotkey('Alt+Shift+Z')")).toEqual({
      ok: true,
    });
    native(50, 50, [alt, shift, 0x78]);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await overlaysVisible(app)).toEqual([false]);
    native(50, 50, [alt, shift, 0x7a]);
    await expect.poll(() => overlaysVisible(app)).toEqual([true]);
    await overlayPage(app).keyboard.press("Escape");
    await idle(app);
    void blink;
  });
});

for (const [lang, english] of [
  ["en", true],
  ["ja", false],
  ["zh-TW", false],
])
  test(`the permission page follows the system language (${lang}) and reduced motion holds the ON frame`, async () => {
    await withApp([1, { lang }], async ({ app }) => {
      await app.firstWindow();
      await background(app);
      await app.evaluate(
        async ({ screen }, module) => {
          const windows = await globalThis.b3Import(module);
          // Linux reports a kernel version; show the macOS 14 switch.
          process.getSystemVersion = () => "14.6";
          globalThis.b3Permission = await windows.createPermissionWindow(
            screen.getPrimaryDisplay(),
          );
        },
        new URL("../windows.mjs", import.meta.url).href,
      );
      let page;
      await expect
        .poll(() => {
          page = app.windows().find((p) => /permission\.html$/.test(p.url()));
          return !!page;
        })
        .toBe(true);
      await expect(page.locator("#lead")).not.toBeEmpty();
      const text = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        lead: document.getElementById("lead").textContent,
        settings: document.getElementById("settings").textContent,
      }));
      expect(text.lang.toLowerCase()).toBe(lang.toLowerCase());
      if (english) expect(text.lead).toMatch(/Screen Recording|screen/i);
      else expect(text.lead).toMatch(/[぀-ヿ一-鿿]/);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const frame = await page.evaluate(() => {
        const toggle = document.getElementById("toggle");
        const knob = getComputedStyle(toggle.querySelector("i"));
        return {
          animations: document.getAnimations().length,
          knob: knob.transform,
          track: getComputedStyle(toggle).backgroundColor,
          off: getComputedStyle(toggle, "::before").opacity,
        };
      });
      expect(frame.animations).toBe(0);
      expect(frame.off).toBe("0");
      expect(frame.knob).toMatch(/matrix\(1, 0, 0, 1, 14, 0\)/);
      await desktopShot(app, `permission-${lang}`);
      await app.evaluate(() => globalThis.b3Permission.close());
    });
  });
