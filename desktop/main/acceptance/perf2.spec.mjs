import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch, native, keys, click } from "./support.mjs";
import { background, onBlink } from "./helpers.mjs";
import { bodyPoint } from "./support.mjs";
import {
  cardPage,
  place,
  install,
  marks,
  collect,
  writeRows,
  holdRows,
} from "./perf-kit.mjs";

const results = {};

/** A session that answers a guide request with a guide of the page and
 * anything else with one line. */
const fakeSession = (app) =>
  app.evaluate(() => {
    const listeners = new Set();
    const guide = {
      purpose: "A blue page with a sentence on it.",
      title: "Test page",
      sections: [
        {
          id: "s1",
          rect: { x: 20, y: 20, width: 500, height: 120 },
          label: "Heading",
          description: "The sentence at the top",
          paragraphs: ["It names the page."],
        },
        {
          id: "s2",
          rect: { x: 20, y: 300, width: 600, height: 300 },
          label: "Body",
          description: "The empty area",
          paragraphs: ["Nothing is written here."],
        },
      ],
      steps: [
        { id: "t1", note: "Read the heading.", regionIds: ["s1"] },
        { id: "t2", note: "Look at the empty body.", regionIds: ["s2"] },
      ],
    };
    globalThis.blinklingTest.features.setSession({
      subscribe: (f) => {
        listeners.add(f);
        return () => listeners.delete(f);
      },
      send: async (turn) => {
        const text =
          turn.source === "guide"
            ? JSON.stringify(guide)
            : "This is a blue test page.\n\nIt has one sentence.";
        setTimeout(() => {
          for (const f of listeners) {
            f({
              type: "message",
              role: "assistant",
              content: [{ type: "text", text }],
            });
            f({ type: "done", turnId: turn.id });
          }
        }, 400);
      },
      stop: async () => {},
    });
  });
const browser = (app) =>
  app.evaluate(({ screen }) => {
    const c = globalThis.blinklingTest.features.capture,
      b = screen.getPrimaryDisplay().bounds;
    c.companion = () => true;
    c.list = async () => [
      {
        id: "w1",
        title: "Docs - Google Chrome",
        bounds: { x: 0, y: 0, width: b.width, height: b.height },
      },
    ];
    c.fullPage = async () => {
      await new Promise((r) => setTimeout(r, 1500));
      return { tiles: [] };
    };
  });
const windowOf = (app, part) =>
  app.windows().find((p) => p.url().includes(part));
const cardShown = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => w.isVisible() && w.webContents.getURL().includes("surface=card"),
    ),
  );
const picture = (w, h) => {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([40 + ((i / 4) % 200), 160, 90, 255], i);
  return PNG.sync.write(png).toString("base64");
};

/** Guide, Auto explain, a full page capture, typing, dragging with the card
 * open and the eat on every edge: the same budget as the rest of perf.json. */
for (const scale of [1, 2])
  test(`Guide, Auto explain, full page, typing, dragging with the card open and the eat on each edge keep to the frame budget at ${scale * 100}%`, async () => {
    test.setTimeout(400000);
    const rows = (results[`${scale * 100}%`] = {});
    const at = (p) => p && { x: p.x * scale, y: p.y * scale };
    const { app, page } = await launch({ scale });
    try {
      await background(app);
      await fakeSession(app);
      await browser(app);
      await place(app, "right", 0.5);
      await page.waitForTimeout(800);
      await app.evaluate(() => {
        const { composer } = globalThis.blinklingTest;
        globalThis.__hidden = [];
        setInterval(() => {
          if (!composer.isVisible()) globalThis.__hidden.push(Date.now());
        }, 20);
      });
      const hidden = () => app.evaluate(() => globalThis.__hidden);
      await install(page);
      const card = () => cardPage(app);
      const layer = windowOf(app, "layer.html");
      await install(layer);
      const measure = async (name, pages, run) => {
        await marks(pages(), name);
        await run();
        rows[name] = await collect(pages(), name, await hidden());
      };
      const ask = (action) =>
        page.evaluate((a) => void window.blinkling.action(a), action);

      // Guide: the overlay draws the marks, the card walks the steps.
      await install(card());
      const overlay = () => windowOf(app, "/overlay/");
      await measure(
        "guide",
        () => [page, card(), overlay()].filter(Boolean),
        async () => {
          await ask("guide");
          // The overlay is made when the marks first draw: it is measured from
          // the moment the page can be reached.
          await expect.poll(() => overlay(), { timeout: 8000 }).toBeTruthy();
          await install(overlay());
          await marks([overlay()], "guide");
          await expect(card().locator(".gl-guide-head")).toContainText(/1.*2/, {
            timeout: 8000,
          });
          await page.waitForTimeout(1200);
          await card().locator('[data-action="guide-next"]').click();
          await page.waitForTimeout(1200);
        },
      );

      // Auto explain: on, the screen is looked at, the card opens and answers.
      await measure(
        "auto_explain",
        () => [page, card()],
        async () => {
          await ask("auto-explain");
          await page.waitForTimeout(3500);
          await ask("auto-explain");
          await page.waitForTimeout(500);
        },
      );

      // A full page capture of a slow page: the line, then the picture.
      await measure(
        "fullpage",
        () => [page, card()],
        async () => {
          await ask("capture");
          await expect
            .poll(
              () =>
                app.evaluate(
                  () => !globalThis.blinklingTest.features.capture.busy,
                ),
              { timeout: 20000 },
            )
            .toBe(true);
          await page.waitForTimeout(800);
        },
      );

      // Typing in the card.
      if (!(await cardShown(app))) await ask("click");
      await expect.poll(() => cardShown(app)).toBe(true);
      await install(card());
      // A person clicks into the box; the keys then go where the window manager
      // has put the focus.
      const box = await card().evaluate(() => {
        const r = document
          .querySelector("textarea.gl-input")
          .getBoundingClientRect();
        return {
          x: window.screenX + r.x + r.width / 2,
          y: window.screenY + r.y + r.height / 2,
        };
      });
      click(box.x * scale, box.y * scale);
      await page.waitForTimeout(400);
      await measure(
        "typing",
        () => [page, card()],
        async () => {
          keys("The quick brown fox jumps over the lazy dog, twice over. ");
          keys("The quick brown fox jumps over the lazy dog, twice over.");
          await page.waitForTimeout(500);
          // The keys really arrived: a typing row of an empty box proves nothing.
          const typed = await card().locator("textarea.gl-input").inputValue();
          expect(typed.length).toBeGreaterThan(80);
        },
      );

      // Blink is carried across the screen with the card open.
      await onBlink(page);
      const grab = at(await bodyPoint(page));
      await measure(
        "drag_card",
        () => [page, card()],
        async () => {
          native([
            { type: "move", x: grab.x, y: grab.y },
            { type: "down", wait: 0 },
          ]);
          native([
            ...Array.from({ length: 60 }, (_, i) => ({
              type: "move",
              x: grab.x - (6 + i * 9) * scale,
              y: grab.y + Math.sin(i / 6) * 90 * scale,
              wait: 0.016,
            })),
            { type: "wait", seconds: 0.2 },
            { type: "up" },
          ]);
          await page.waitForTimeout(600);
        },
      );

      // The eat on each edge: the layer draws the flight into the mouth.
      for (const edge of ["right", "left", "top", "bottom"]) {
        await place(app, edge, 0.5);
        await page.waitForTimeout(1500);
        await marks([layer], "eat");
        await app.evaluate(
          async ({ screen }, [data, region]) => {
            await globalThis.blinklingTest.attachCapture({
              image: {
                id: "perf-eat",
                name: "perf-eat.png",
                mediaType: "image/png",
                data,
              },
              display: screen.getPrimaryDisplay(),
              region,
            });
          },
          [picture(360, 240), { x: 300, y: 160, width: 360, height: 240 }],
        );
        rows[`eat_${edge}`] = await collect([layer], "eat", []);
        await page.waitForTimeout(1500);
      }
    } finally {
      await app.close();
    }
    writeRows(results);
    console.log("PERF2 " + JSON.stringify(results));
    holdRows(expect, rows);
  });
