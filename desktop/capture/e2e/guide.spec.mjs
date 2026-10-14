import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import {
  launch,
  background,
  desktopShot,
  nextWindow,
  native,
  nativeBounds,
  reports,
} from "./support.mjs";
const overlayPath = fileURLToPath(
  new URL("../../overlay/index.mjs", import.meta.url),
);
const windowPath = fileURLToPath(new URL("../windows.mjs", import.meta.url));
const permissionPath = fileURLToPath(
  new URL("../permission.mjs", import.meta.url),
);
test("Escape while a native guide loads cannot resurrect its window", async () => {
  const { app, close } = await launch();
  try {
    await background(app);
    native(30, 30);
    await app.evaluate(async ({ screen }) => {
      const f = globalThis.glimpseletTest.features;
      const capture = await f.capture.screen(
        String(screen.getPrimaryDisplay().id),
        undefined,
        { attach: false },
      );
      const original = f.overlay.create;
      f.overlay.create = async (...args) => {
        await new Promise((resolve) => (globalThis.b3ReleaseGuide = resolve));
        return original(...args);
      };
      globalThis.b3Race = f.overlay.show(capture, [
        { rect: { x: 240, y: 160, width: 160, height: 100 }, label: "Result" },
      ]);
    });
    native(30, 30, [0xff1b]);
    expect(
      await app.evaluate(
        () => !!globalThis.glimpseletTest.features.overlay.capture,
      ),
    ).toBe(false);
    expect(
      await app.evaluate(async () => {
        globalThis.b3ReleaseGuide();
        return globalThis.b3Race;
      }),
    ).toBe(false);
    expect(
      await app.evaluate(
        () => !!globalThis.glimpseletTest.features.overlay.window,
      ),
    ).toBe(false);
    expect(await app.evaluate(() => globalThis.b3Background.isFocused())).toBe(
      true,
    );
  } finally {
    await close();
  }
});
for (const scale of [1, 1.5, 2])
  test(`full-display section supports nested callouts without overlap ${scale}`, async () => {
    const { app, close } = await launch(scale);
    try {
      const d = await background(app);
      native(30, 30);
      const page = await nextWindow(app, () =>
        app.evaluate(async ({ screen }) => {
          const f = globalThis.glimpseletTest.features;
          const capture = await f.capture.screen(
            String(screen.getPrimaryDisplay().id),
            undefined,
            { attach: false },
          );
          await f.overlay.show(capture, [
            {
              rect: {
                x: 0,
                y: 0,
                width: capture.display.bounds.width,
                height: capture.display.bounds.height,
              },
              label: "整個畫面的用途",
            },
            {
              rect: { x: 24, y: 24, width: 260, height: 48 },
              label: "主要標題",
            },
            {
              rect: { x: 240, y: 160, width: 160, height: 100 },
              label: "主要結果與重要段落",
            },
          ]);
        }),
      );
      const layout = await page.evaluate(() =>
        [...document.querySelectorAll(".label")].map((el) => {
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
      expect(layout).toHaveLength(3);
      const content = [
        { x: 24, y: 24, right: 284, bottom: 72 },
        { x: 240, y: 160, right: 400, bottom: 260 },
        ...d.blinkRegions.map((r) => ({
          ...r,
          right: r.x + r.width,
          bottom: r.y + r.height,
        })),
      ];
      for (const [index, r] of layout.entries()) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(d.bounds.width);
        expect(r.bottom).toBeLessThanOrEqual(d.bounds.height);
        expect(r.scroll).toBeLessThanOrEqual(r.client);
        for (const other of [...content, ...layout.slice(index + 1)])
          expect(
            r.x >= other.right ||
              other.x >= r.right ||
              r.y >= other.bottom ||
              other.y >= r.bottom,
          ).toBe(true);
      }
      await desktopShot(app, `guide-full-screen-${scale}`);
      native(320 * scale, 230 * scale);
      expect(
        await app.evaluate(() => globalThis.b3Background.isFocused()),
      ).toBe(true);
    } finally {
      await close();
    }
  });
for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"])
    test(`guide geometry native pass-through and clean labels ${scale} ${theme}`, async () => {
      const { app, close } = await launch(scale);
      try {
        await app.firstWindow();
        const d = await background(app);
        native(30, 30);
        const page = await nextWindow(app, () =>
          app.evaluate(
            async ({ screen }, { path, theme }) => {
              const { createOverlay } = await globalThis.b3Import(path);
              const overlay = await createOverlay(
                screen.getPrimaryDisplay(),
                [
                  {
                    id: "header",
                    rect: { x: 24, y: 24, width: 260, height: 48 },
                    label: "整個畫面的用途與主要段落說明",
                    steps: [0],
                  },
                  {
                    id: "result",
                    rect: { x: 240, y: 160, width: 160, height: 100 },
                    label:
                      "主要結果：這段文字保持清楚，所有內容都留在訊息泡泡裡",
                    steps: [1],
                    arrows: [
                      {
                        from: { x: 180, y: 120 },
                        to: { x: 240, y: 190 },
                        step: 1,
                      },
                    ],
                  },
                ],
                { theme },
              );
              globalThis.b3Overlay = overlay;
            },
            { path: overlayPath, theme },
          ),
        );
        await expect(page.locator("body")).toHaveAttribute(
          "data-ready",
          "true",
        );
        // Verify native pixels: Electron rounds a fractional DIP window up,
        // while screen.bounds rounds the same monitor down at 150%.
        expect(await nativeBounds(app, "b3Overlay")).toEqual({
          x: 0,
          y: 0,
          width: 1280,
          height: 800,
        });
        const layout = await page.evaluate(() =>
          [...document.querySelectorAll(".label")].map((el) => {
            const r = el.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              right: r.right,
              bottom: r.bottom,
              scroll: el.scrollWidth,
              client: el.clientWidth,
            };
          }),
        );
        expect(layout).toHaveLength(2);
        for (const r of layout) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.right).toBeLessThanOrEqual(d.bounds.width);
          expect(r.bottom).toBeLessThanOrEqual(d.bounds.height);
          expect(r.scroll).toBeLessThanOrEqual(r.client);
          // Number pills must not hide text in any explained screen region.
          for (const content of [
            { x: 24, y: 24, right: 284, bottom: 72 },
            { x: 240, y: 160, right: 400, bottom: 260 },
          ])
            expect(
              r.x >= content.right ||
                content.x >= r.right ||
                r.y >= content.bottom ||
                content.y >= r.bottom,
            ).toBe(true);
        }
        const [a, b] = layout;
        expect(
          a.x >= b.right ||
            b.x >= a.right ||
            a.y >= b.bottom ||
            b.y >= a.bottom,
        ).toBe(true);
        const bytes = await desktopShot(app, `guide-${scale}-${theme}`);
        const image = PNG.sync.read(bytes),
          sx = image.width / d.bounds.width,
          sy = image.height / d.bounds.height;
        const point = (x, y) =>
          Array.from(
            image.data.subarray(
              (Math.round(y * sy) * image.width + Math.round(x * sx)) * 4,
              (Math.round(y * sy) * image.width + Math.round(x * sx)) * 4 + 3,
            ),
          );
        expect(point(240, 210)).toEqual([61, 220, 151]);
        expect(point(320, 230)).toEqual([232, 73, 73]);
        native(320 * sx, 230 * sy);
        expect(
          await app
            .evaluate(() =>
              globalThis.b3Background.webContents.executeJavaScript(
                "clicks.at(-1)",
              ),
            )
            .then((p) => p.map(Math.round)),
        ).toEqual([320, 230]);
        expect(
          await app.evaluate(() => globalThis.b3Background.isFocused()),
        ).toBe(true);
        await app.evaluate(() =>
          globalThis.b3Overlay.webContents.send("glimpselet:overlay:step", 0),
        );
        await expect(page.locator(".label").nth(0)).toBeVisible();
        await expect(page.locator(".label").nth(1)).toBeHidden();
        await app.evaluate(() =>
          globalThis.b3Overlay.webContents.send("glimpselet:overlay:step", 1),
        );
        await expect(page.locator(".label").nth(0)).toBeHidden();
        await expect(page.locator(".label").nth(1)).toBeVisible();
        await app.evaluate(() =>
          globalThis.b3Overlay.webContents.send("glimpselet:overlay:step", -1),
        );
        await expect(page.locator(".label").nth(0)).toBeVisible();
        const timing = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const frames = [],
                motionFrames = [],
                states = new Set();
              const label = document.querySelector(".label");
              for (const animation of document.getAnimations()) {
                animation.currentTime = 0;
                animation.play();
              }
              let previous;
              function step(t) {
                const opacity = getComputedStyle(label).opacity;
                states.add(opacity);
                if (previous !== undefined) {
                  frames.push(t - previous);
                  if (Number(opacity) < 0.999) motionFrames.push(t - previous);
                }
                previous = t;
                if (frames.length < 120) requestAnimationFrame(step);
                else
                  resolve({
                    states: states.size,
                    motionFps:
                      1000 /
                      (motionFrames.reduce((a, b) => a + b, 0) /
                        motionFrames.length),
                    fps:
                      1000 /
                      (frames.reduce((a, b) => a + b, 0) / frames.length),
                    p95: [...frames].sort((a, b) => a - b)[
                      Math.floor(frames.length * 0.95)
                    ],
                  });
              }
              requestAnimationFrame(step);
            }),
        );
        expect(timing.states).toBeGreaterThan(5);
        expect(timing.motionFps).toBeGreaterThan(50);
        expect(timing.fps).toBeGreaterThan(50);
        expect(timing.p95).toBeLessThan(30);
        await writeFile(
          `${reports}/guide-timing-${scale}-${theme}.json`,
          JSON.stringify(timing, null, 2),
        );
        await app.evaluate(() => globalThis.b3Overlay.close());
      } finally {
        await close();
      }
    });
test("guide session image/steps, Escape/Blink exit and content movement invalidation", async () => {
  const { app, close } = await launch();
  try {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    await blink.evaluate(() => {
      window.guides = [];
      window.glimpselet.onEvent((e) => {
        if (e.type === "guide") window.guides.push(e);
      });
    });
    await app.evaluate(() => {
      let listener;
      const f = globalThis.glimpseletTest.features;
      const model = {
        purpose: "This report explains the screen.",
        sections: [
          {
            id: "results",
            rect: { x: 240, y: 160, width: 160, height: 100 },
            label: "Results",
            description: "The main outcome.",
            paragraphs: ["A red results panel."],
          },
        ],
        steps: [
          {
            id: "one",
            note: "Read the results.",
            regionIds: ["results"],
            arrows: [],
          },
          {
            id: "two",
            note: "Compare the report.",
            regionIds: ["results"],
            arrows: [],
          },
        ],
      };
      f.setSession({
        subscribe: (fn) => {
          listener = fn;
          return () => (listener = null);
        },
        send: async (turn) => {
          globalThis.b3Turn = turn;
          listener({
            type: "delta",
            id: "answer",
            text: JSON.stringify(model),
          });
          listener({ type: "done", turnId: turn.id });
        },
        stop: async () => {},
      });
    });
    const start = () =>
      blink.evaluate(() => {
        void window.glimpselet.action("guide");
      });
    const guidePage = await nextWindow(app, start);
    await expect(guidePage.locator("body")).toHaveAttribute(
      "data-ready",
      "true",
    );
    const sent = await app.evaluate(() => ({
      source: globalThis.b3Turn.source,
      image: globalThis.b3Turn.attachments[0].data,
    }));
    expect(sent.source).toBe("guide");
    expect(PNG.sync.read(Buffer.from(sent.image, "base64")).width).toBe(1280);
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).phase))
      .toBe("overview");
    await blink.evaluate(() => window.glimpselet.action("guide-next"));
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(0);
    await blink.evaluate(() => window.glimpselet.action("guide-next"));
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(1);
    await blink.evaluate(() => window.glimpselet.action("guide-back"));
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(0);
    // Changing real underlying content must clear old coordinate drawings automatically.
    await app.evaluate(() =>
      globalThis.b3Background.webContents.executeJavaScript(
        "document.querySelector('#target').style.left='420px'",
      ),
    );
    await expect
      .poll(() =>
        app.evaluate(
          () => !!globalThis.glimpseletTest.features.overlay.capture,
        ),
      )
      .toBe(false);
    await app.evaluate(() =>
      globalThis.b3Background.webContents.executeJavaScript(
        "document.body.style.background='#204080';document.querySelector('#target').style.left='240px'",
      ),
    );
    await nextWindow(app, start);
    native(30, 30, [0xff1b]);
    await expect
      .poll(() =>
        app.evaluate(
          () => !!globalThis.glimpseletTest.features.overlay.capture,
        ),
      )
      .toBe(false);
    await nextWindow(app, start);
    const pos = await blink.locator('rect[fill="#3ddc97"]').boundingBox();
    native(
      Math.max(8, Math.min(1272, pos.x + pos.width * 0.35)),
      Math.max(8, Math.min(792, pos.y + pos.height * 0.72)),
    );
    await expect
      .poll(() =>
        app.evaluate(
          () => !!globalThis.glimpseletTest.features.overlay.capture,
        ),
      )
      .toBe(false);
  } finally {
    await close();
  }
});
for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"])
    test(`permission exact switch illustration and loop ${scale} ${theme}`, async () => {
      const { app, close } = await launch(scale);
      try {
        await app.firstWindow();
        await background(app);
        const page = await nextWindow(app, () =>
          app.evaluate(
            async ({ screen }, { path, labelsPath }) => {
              const { createCaptureWindow } = await globalThis.b3Import(path);
              const { permissionLabels } =
                await globalThis.b3Import(labelsPath);
              globalThis.b3Permission = await createCaptureWindow(
                "permission",
                screen.getPrimaryDisplay(),
                { labels: permissionLabels("14.6") },
              );
            },
            { path: windowPath, labelsPath: permissionPath },
          ),
        );
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator("h1")).toHaveText(
          "Screen & System Audio Recording",
        );
        const layout = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              "main p,h1,.sidebar,.app-row,.buttons",
            ),
          ].map((e) => {
            const r = e.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: e.clientWidth,
              scroll: e.scrollWidth,
            };
          }),
        );
        for (const b of layout) {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.right).toBeLessThanOrEqual(
            await page.evaluate(() => innerWidth),
          );
          expect(b.bottom).toBeLessThanOrEqual(
            await page.evaluate(() => innerHeight),
          );
          expect(b.scroll).toBeLessThanOrEqual(b.width);
        }
        await page.screenshot({
          path: `${(await import("./support.mjs")).reports}/permission-${scale}-${theme}.png`,
          animations: "allow",
        });
        const animation = await page.locator(".switch").evaluate((el) =>
          el.getAnimations().map((a) => ({
            duration: a.effect.getTiming().duration,
            iterations: a.effect.getTiming().iterations,
          })),
        );
        expect(animation[0]).toEqual({ duration: 4000, iterations: Infinity });
        // Observe the actual running loop rather than only its declared CSS.
        const animationMotion = await page
          .locator(".switch")
          .evaluate(async (el) => {
            const states = new Set();
            const start = performance.now();
            const frames = [];
            let previous;
            await new Promise((resolve) => {
              function frame(t) {
                if (previous !== undefined) frames.push(t - previous);
                previous = t;
                states.add(getComputedStyle(el).backgroundColor);
                if (performance.now() - start >= 4100) resolve();
                else requestAnimationFrame(frame);
              }
              requestAnimationFrame(frame);
            });
            return {
              states: states.size,
              fps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
              p95: frames.sort((a, b) => a - b)[
                Math.floor(frames.length * 0.95)
              ],
            };
          });
        expect(animationMotion.states).toBeGreaterThan(20);
        expect(animationMotion.fps).toBeGreaterThan(50);
        expect(animationMotion.p95).toBeLessThan(30);
        await writeFile(
          `${reports}/permission-timing-${scale}-${theme}.json`,
          JSON.stringify(animationMotion, null, 2),
        );
        await app.evaluate(() => globalThis.b3Permission.close());
      } finally {
        await close();
      }
    });

const holdMs = Number(process.env.GLIMPSELET_GUIDE_HOLD_MS ?? 60000);
test("guide stays on a static screen with streaming answer bubbles until the user ends it", async () => {
  test.setTimeout(holdMs + 60000);
  const { app, close } = await launch();
  try {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    await app.evaluate(() => {
      let listener;
      const f = globalThis.glimpseletTest.features;
      globalThis.b3Dismissals = [];
      f.overlay.on("dismissed", (reason) => b3Dismissals.push(reason));
      const model = {
        purpose: "This report explains the screen.",
        sections: [
          {
            id: "page",
            rect: { x: 0, y: 0, width: 1280, height: 800 },
            label: "Report",
            description: "The whole page.",
            paragraphs: ["A report."],
          },
          {
            id: "title",
            rect: { x: 24, y: 24, width: 260, height: 48 },
            label: "Title",
            description: "The heading.",
            paragraphs: [],
          },
          {
            id: "results",
            rect: { x: 240, y: 160, width: 160, height: 100 },
            label: "Results",
            description: "The main outcome.",
            paragraphs: ["A red results panel."],
          },
        ],
        steps: [
          {
            id: "one",
            note: "Read the results.",
            regionIds: ["results"],
            arrows: [
              { from: { x: 120, y: 120 }, to: { x: 240, y: 200 } },
            ],
          },
        ],
      };
      f.setSession({
        subscribe: (fn) => {
          listener = fn;
          return () => (listener = null);
        },
        send: async (turn) => {
          listener({ type: "delta", id: "answer", text: JSON.stringify(model) });
          listener({ type: "done", turnId: turn.id });
        },
        stop: async () => {},
      });
    });
    const page = await nextWindow(app, () =>
      blink.evaluate(() => {
        void window.glimpselet.action("guide");
      }),
    );
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    const end = Date.now() + holdMs;
    let n = 0;
    while (Date.now() < end) {
      // Answer bubbles keep arriving beside Blink while the screen is static.
      await app.evaluate((_e, i) => {
        const send = globalThis.glimpseletTest.send;
        send({
          type: "message",
          id: `stream-${i}`,
          role: "assistant",
          content: [{ type: "text", text: `這是第 ${i} 句說明。` }],
        });
      }, n++);
      await new Promise((r) => setTimeout(r, 1500));
      expect(
        await app.evaluate(() => globalThis.b3Dismissals),
        "overlay dismissed itself",
      ).toEqual([]);
    }
    expect(
      await app.evaluate(
        () => !!globalThis.glimpseletTest.features.overlay.capture,
      ),
    ).toBe(true);
    await desktopShot(app, "guide-held");
    await blink.evaluate(() => window.glimpselet.action("guide-dismiss"));
    expect(await app.evaluate(() => globalThis.b3Dismissals)).toEqual(["user"]);
  } finally {
    await close();
  }
});
