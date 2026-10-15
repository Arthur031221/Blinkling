import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { closingMessage } from "../../overlay/guide.mjs";

const CLOSING = closingMessage("en");
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
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
test("Escape while a guide is loading cannot resurrect its overlay", async () => {
  const { app, close } = await launch();
  try {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    await scriptedSession(app, [JSON.stringify(twoStepModel)]);
    await app.evaluate(() => {
      const f = globalThis.blinklingTest.features;
      const original = f.overlay.create;
      f.overlay.create = async (...args) => {
        await new Promise((resolve) => (globalThis.b3ReleaseGuide = resolve));
        return original(...args);
      };
    });
    blink.evaluate(() => void window.blinkling.action("guide"));
    await expect
      .poll(() => app.evaluate(() => !!globalThis.b3ReleaseGuide))
      .toBe(true);
    native(30, 30, [0xff1b]);
    await app.evaluate(() => globalThis.b3ReleaseGuide());
    await expect
      .poll(() =>
        app.evaluate(
          () => globalThis.blinklingTest.features.overlay.window ?? null,
        ),
      )
      .toBe(null);
    expect(
      await app.evaluate(
        () => !!globalThis.blinklingTest.features.overlay.capture,
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
          const f = globalThis.blinklingTest.features;
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
    test(`numbered marks stay native-sized, click-through, dim on focus and keep clear labels ${scale} ${theme}`, async () => {
      const { app, close } = await launch(scale);
      try {
        await app.firstWindow();
        const d = await background(app);
        native(30, 30);
        const before = PNG.sync.read(
          await desktopShot(app, `marks-bare-${scale}-${theme}`),
        );
        const page = await nextWindow(app, () =>
          app.evaluate(
            async ({ screen }, { path, theme }) => {
              const { createOverlay } = await globalThis.b3Import(path);
              globalThis.b3Overlay = await createOverlay(
                screen.getPrimaryDisplay(),
                [
                  {
                    id: "header",
                    n: 1,
                    kind: "underline",
                    rect: { x: 24, y: 24, width: 260, height: 48 },
                    label: "整個畫面的用途與主要段落說明",
                  },
                  {
                    id: "result",
                    n: 2,
                    kind: "outline",
                    rect: { x: 240, y: 160, width: 160, height: 100 },
                    label:
                      "主要結果：這段文字保持清楚，所有內容都留在訊息泡泡裡",
                  },
                ],
                { theme },
              );
            },
            { path: overlayPath, theme },
          ),
        );
        await expect(page.locator("body")).toHaveAttribute("data-drawn", /\d+/);
        // Verify native pixels: Electron rounds a fractional DIP window up,
        // while screen.bounds rounds the same monitor down at 150%.
        expect(await nativeBounds(app, "b3Overlay")).toEqual({
          x: 0,
          y: 0,
          width: 1280,
          height: 800,
        });
        await expect(page.locator(".badge")).toHaveText(["1", "2"]);
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
        expect(layout).toHaveLength(2);
        const content = [
          { x: 24, y: 24, right: 284, bottom: 72 },
          { x: 240, y: 160, right: 400, bottom: 260 },
        ];
        const apart = (a, b) =>
          a.x >= b.right ||
          b.x >= a.right ||
          a.y >= b.bottom ||
          b.y >= a.bottom;
        for (const r of layout) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.right).toBeLessThanOrEqual(d.bounds.width);
          expect(r.bottom).toBeLessThanOrEqual(d.bounds.height);
          expect(r.scroll).toBeLessThanOrEqual(r.client);
          // A label never hides the text of an explained region.
          for (const c of content) expect(apart(r, c)).toBe(true);
        }
        expect(apart(layout[0], layout[1])).toBe(true);
        // The marks are really on screen: pixels along each outline changed.
        await expect
          .poll(async () => {
            const image = PNG.sync.read(
              await desktopShot(app, `marks-${scale}-${theme}`),
            );
            let changed = 0;
            for (let i = 0; i < image.data.length; i += 4)
              if (
                image.data[i] !== before.data[i] ||
                image.data[i + 1] !== before.data[i + 1] ||
                image.data[i + 2] !== before.data[i + 2]
              )
                changed++;
            return changed > 200;
          })
          .toBe(true);
        // Click-through: a click inside a mark reaches the window below.
        native(320 * scale, 230 * scale);
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
        // Focus dims every mark outside it and no argument brings them back.
        const opacity = (n) =>
          page
            .locator(`.badge[data-n="${n}"]`)
            .evaluate((el) => Number(getComputedStyle(el).opacity));
        const command = (name, arg) =>
          app.evaluate(
            (_e, c) =>
              globalThis.b3Overlay.webContents.send(
                "blinkling:overlay:command",
                c,
              ),
            { name, arg },
          );
        await command("focus", [2]);
        await expect.poll(() => opacity(1)).toBeLessThan(0.5);
        expect(await opacity(2)).toBe(1);
        await expect(page.locator("body")).toHaveAttribute("data-focus", "2");
        await command("focus", null);
        await expect.poll(() => opacity(1)).toBe(1);
        const timing = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const frames = [],
                states = new Set();
              const badge = document.querySelector(".badge");
              for (const animation of document.getAnimations()) {
                animation.currentTime = 0;
                animation.play();
              }
              let previous;
              function step(t) {
                states.add(getComputedStyle(badge).opacity);
                if (previous !== undefined) frames.push(t - previous);
                previous = t;
                if (frames.length < 120) requestAnimationFrame(step);
                else
                  resolve({
                    states: states.size,
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
      window.blinkling.onEvent((e) => {
        if (e.type === "guide") window.guides.push(e);
      });
    });
    await app.evaluate(() => {
      let listener;
      const f = globalThis.blinklingTest.features;
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
          },
          {
            id: "two",
            note: "Compare the report.",
            regionIds: ["results"],
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
        void window.blinkling.action("guide");
      });
    const guidePage = await nextWindow(app, start);
    await expect(guidePage.locator("body")).toHaveAttribute(
      "data-drawn",
      /\d+/,
    );
    await expect(guidePage.locator(".badge")).toHaveText(["1"]);
    const sent = await app.evaluate(() => ({
      source: globalThis.b3Turn.source,
      image: globalThis.b3Turn.attachments[0].data,
    }));
    expect(sent.source).toBe("guide");
    expect(PNG.sync.read(Buffer.from(sent.image, "base64")).width).toBe(1280);
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).phase))
      .toBe("overview");
    await blink.evaluate(() => window.blinkling.action("guide-next"));
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(0);
    await blink.evaluate(() => window.blinkling.action("guide-next"));
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(1);
    await blink.evaluate(() => window.blinkling.action("guide-back"));
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
        app.evaluate(() => !!globalThis.blinklingTest.features.overlay.capture),
      )
      .toBe(false);
    await app.evaluate(() =>
      globalThis.b3Background.webContents.executeJavaScript(
        "document.body.style.background='#204080';document.querySelector('#target').style.left='240px'",
      ),
    );
    await showAgain(app, start);
    native(30, 30, [0xff1b]);
    await expect
      .poll(() =>
        app.evaluate(() => !!globalThis.blinklingTest.features.overlay.capture),
      )
      .toBe(false);
    expect(await blink.evaluate(() => window.guides.at(-1).phase)).toBe(
      "dismissed",
    );
    // The arrow keys step through the guide from anywhere.
    await showAgain(app, start);
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).phase))
      .toBe("overview");
    native(30, 30, [0xff53]);
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(0);
    native(30, 30, [0xff53]);
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(1);
    native(30, 30, [0xff51]);
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(0);
    await blink.evaluate(() => window.blinkling.action("guide-dismiss"));
    await expect
      .poll(() =>
        app.evaluate(() => !!globalThis.blinklingTest.features.overlay.capture),
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
          app.evaluate(async ({ screen }, path) => {
            const { createPermissionWindow } = await globalThis.b3Import(path);
            // Linux reports a kernel version; show the macOS 14 pane.
            process.getSystemVersion = () => "14.6";
            globalThis.b3Permission = await createPermissionWindow(
              screen.getPrimaryDisplay(),
            );
          }, windowPath),
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
          el.getAnimations({ subtree: true }).map((a) => ({
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
                states.add(getComputedStyle(el.querySelector("i")).transform);
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

const holdMs = Number(process.env.BLINKLING_GUIDE_HOLD_MS ?? 60000);
test("guide stays on a static screen with streaming answer bubbles until the user ends it", async () => {
  test.setTimeout(holdMs + 60000);
  const { app, close } = await launch();
  try {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    await app.evaluate(() => {
      let listener;
      const f = globalThis.blinklingTest.features;
      globalThis.b3Dismissals = [];
      f.overlay.on("dismissed", (reason) =>
        globalThis.b3Dismissals.push(reason),
      );
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
          },
        ],
      };
      f.setSession({
        subscribe: (fn) => {
          listener = fn;
          return () => (listener = null);
        },
        send: async (turn) => {
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
    const page = await nextWindow(app, () =>
      blink.evaluate(() => {
        void window.blinkling.action("guide");
      }),
    );
    await expect(page.locator("body")).toHaveAttribute("data-drawn", /\d+/);
    const end = Date.now() + holdMs;
    let n = 0;
    while (Date.now() < end) {
      // Answer bubbles keep arriving beside Blink while the screen is static.
      await app.evaluate((_e, i) => {
        const send = globalThis.blinklingTest.send;
        send({
          type: "message",
          id: `stream-${i}`,
          role: "assistant",
          content: [{ type: "text", text: `這是第 ${i} 句說明。` }],
        });
      }, n++);
      await new Promise((r) => setTimeout(r, 700));
      await new Promise((r) => setTimeout(r, 800));
      expect(
        await app.evaluate(() => globalThis.b3Dismissals),
        `overlay dismissed itself after ${n} streamed bubbles`,
      ).toEqual([]);
    }
    expect(
      await app.evaluate(
        () => !!globalThis.blinklingTest.features.overlay.capture,
      ),
    ).toBe(true);
    await desktopShot(app, "guide-held");
    await blink.evaluate(() => window.blinkling.action("guide-dismiss"));
    expect(await app.evaluate(() => globalThis.b3Dismissals)).toEqual(["user"]);
  } finally {
    await close();
  }
});
/** The overlay window is pooled and reused, so a second guide opens no new
 * page: wait for the service to hold its window again. */
async function showAgain(app, start) {
  await start();
  await expect
    .poll(() =>
      app.evaluate(() => !!globalThis.blinklingTest.features.overlay.window),
    )
    .toBe(true);
}
async function bubbleText(app) {
  return app.evaluate(() =>
    globalThis.blinklingTest.bubbles.webContents.executeJavaScript(
      "document.body.innerText",
    ),
  );
}
const twoStepModel = {
  purpose: "This report explains the screen.",
  sections: [
    {
      id: "results",
      rect: { x: 240, y: 160, width: 160, height: 100 },
      label: "Results",
      description: "The main outcome.",
      paragraphs: ["A red results panel."],
    },
    {
      id: "title",
      rect: { x: 24, y: 24, width: 260, height: 48 },
      label: "Title",
      description: "The heading.",
      paragraphs: [],
    },
  ],
  steps: [
    { id: "one", note: "Read the title.", regionIds: ["title"] },
    {
      id: "two",
      note: "Check the results.",
      regionIds: ["results"],
    },
  ],
};
async function scriptedSession(app, replies) {
  await app.evaluate((_electron, replies) => {
    const { features } = globalThis.blinklingTest;
    let listener;
    globalThis.b3Sends = 0;
    features.setSession({
      subscribe: (fn) => {
        listener = fn;
        return () => (listener = null);
      },
      send: async (turn) => {
        const reply =
          replies[Math.min(globalThis.b3Sends++, replies.length - 1)];
        listener({ type: "delta", id: "answer", text: reply });
        listener({ type: "done", turnId: turn.id });
      },
      stop: async () => {},
    });
  }, replies);
}
test("the last step is drawn, Blink closes the tour, and every control keeps working", async () => {
  const { app, close } = await launch();
  try {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    await blink.evaluate(() => {
      window.guides = [];
      window.blinkling.onEvent((e) => {
        if (e.type === "guide") window.guides.push(e);
      });
    });
    await app.evaluate(() => {
      const { features } = globalThis.blinklingTest;
      globalThis.b3Dismissals = [];
      features.overlay.on("dismissed", (reason) =>
        globalThis.b3Dismissals.push(reason),
      );
    });
    await scriptedSession(app, [JSON.stringify(twoStepModel)]);
    const act = (name) =>
      blink.evaluate((n) => window.blinkling.action(n), name);
    const phase = () => blink.evaluate(() => window.guides.at(-1).phase);
    const drawn = () =>
      app.evaluate(
        () => globalThis.blinklingTest.features.overlay.drawings?.length ?? -1,
      );
    await nextWindow(app, () => act("guide"));
    await expect.poll(phase).toBe("overview");
    await act("guide-next");
    await expect.poll(phase).toBe("step");
    await act("guide-next");
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(1);
    // The last step has its own drawing on screen.
    await expect.poll(drawn).toBeGreaterThan(0);
    await expect.poll(() => bubbleText(app)).toContain("Check the results.");
    await desktopShot(app, "guide-last-step");
    await act("guide-next");
    await expect.poll(phase).toBe("finished");
    await expect.poll(() => bubbleText(app)).toContain(CLOSING);
    await desktopShot(app, "guide-finished");
    await act("guide-back");
    await expect
      .poll(() => blink.evaluate(() => window.guides.at(-1).index))
      .toBe(1);
    await act("guide-overview");
    await expect.poll(phase).toBe("overview");
    await act("guide-dismiss");
    expect(await app.evaluate(() => globalThis.b3Dismissals)).toEqual(["user"]);
  } finally {
    await close();
  }
});
test("a failed guide turn names its reason and offers a retry that reruns the guide", async () => {
  const { app, close } = await launch();
  try {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    await blink.evaluate(() => {
      window.guides = [];
      window.blinkling.onEvent((e) => {
        if (e.type === "guide") window.guides.push(e);
      });
    });
    await scriptedSession(app, [
      "Sorry, I could not read that screen.",
      JSON.stringify(twoStepModel),
    ]);
    const act = (name) =>
      blink.evaluate((n) => window.blinkling.action(n), name);
    const phase = () => blink.evaluate(() => window.guides.at(-1).phase);
    await act("guide");
    await expect.poll(phase).toBe("error");
    // The failure bubble names its reason in one sentence, with a way to retry.
    await expect
      .poll(() => bubbleText(app))
      .toContain(
        "The guide could not finish: Claude's reply was not in a format Blinkling can read.",
      );
    await expect.poll(() => bubbleText(app)).toContain("Try again");
    await desktopShot(app, "guide-error");
    expect(await app.evaluate(() => globalThis.b3Sends)).toBe(1);
    await nextWindow(app, () => act("guide-retry"));
    await expect.poll(phase).toBe("overview");
    expect(await app.evaluate(() => globalThis.b3Sends)).toBe(2);
    await act("guide-dismiss");
  } finally {
    await close();
  }
});
test("the recorded haiku reply at low effort draws as numbered marks", async () => {
  const reply = await readFile(
    new URL("../../overlay/recorded/haiku-low-reply.txt", import.meta.url),
    "utf8",
  );
  const { app, close } = await launch();
  try {
    const blink = await app.firstWindow();
    await background(app);
    native(30, 30);
    await blink.evaluate(() => {
      window.guides = [];
      window.blinkling.onEvent((e) => {
        if (e.type === "guide") window.guides.push(e);
      });
    });
    await scriptedSession(app, [reply]);
    const act = (name) =>
      blink.evaluate((n) => window.blinkling.action(n), name);
    const phase = () => blink.evaluate(() => window.guides.at(-1).phase);
    await nextWindow(app, () => act("guide"));
    // The reply that used to fail every time now reaches the overview.
    await expect.poll(phase).toBe("overview");
    const marks = await app.evaluate(
      () => globalThis.blinklingTest.features.overlay.drawings?.length ?? -1,
    );
    expect(marks).toBeGreaterThanOrEqual(4);
    await expect
      .poll(() => bubbleText(app))
      .not.toContain("The guide could not finish");
    await desktopShot(app, "guide-haiku");
    await act("guide-dismiss");
  } finally {
    await close();
  }
});
