import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
import { launch } from "./support.mjs";
import { background, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";
import { strings } from "../../capture/strings.mjs";

const line = (key) =>
  new RegExp(
    [...new Set(Object.values(strings).map((t) => t[key]))]
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
  );
const tilePng = () => {
  const png = new PNG({ width: 360, height: 240 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([255, 0, 255, 255], i);
  return PNG.sync.write(png).toString("base64");
};
const paperOf = (file) => {
  const { data } = PNG.sync.read(readFileSync(file));
  let paper = 0;
  for (let i = 0; i < data.length; i += 4)
    if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 215) paper++;
  return paper;
};

/** Times, in the main process, of when the picture is handed to Blink and when
 * the card window first shows. */
const watch = (app) =>
  app.evaluate(() => {
    const t = globalThis.blinklingTest,
      log = (globalThis.eatLog = { delivered: null, card: null });
    const c = t.features.capture,
      deliver = c.onCapture;
    c.onCapture = async (...args) => {
      log.delivered = Date.now();
      return deliver(...args);
    };
    setInterval(() => {
      if (log.card === null && t.composer.isVisible()) log.card = Date.now();
    }, 5);
  });

/** One capture whose selection or page read takes `ms` before the picture is
 * ready. */
const slow = (app, kind, ms) =>
  app.evaluate(
    ({ screen }, [kind, ms, data]) => {
      const c = globalThis.blinklingTest.features.capture,
        b = screen.getPrimaryDisplay().bounds;
      const rect = { x: 120, y: 80, width: 900, height: 640 };
      c.list = async () => [
        {
          id: "w1",
          title: "Docs - Google Chrome",
          bounds: { x: 0, y: 0, width: b.width, height: b.height },
        },
      ];
      c.companion = () => true;
      if (kind === "selection") {
        c.overlays.open = async () => {
          await new Promise((r) => setTimeout(r, ms));
          return { kind: "screen" };
        };
      } else {
        c.overlays.open = async () => ({
          kind: "page",
          rect,
          window: { id: "w1" },
        });
        c.fullPage = async () => {
          await new Promise((r) => setTimeout(r, ms));
          return {
            tiles: [0, 1, 2].map((i) => ({
              image: {
                id: `t${i}`,
                name: `t${i}.png`,
                mediaType: "image/png",
                data,
              },
            })),
          };
        };
      }
    },
    [kind, ms, tilePng()],
  );

const status = (page) => page.locator("#status");

for (const [kind, label] of [
  ["selection", "a hotkey capture whose selection takes a while"],
  ["page", "a full page capture the extension takes a while to read"],
]) {
  test(`${label}: no card and no blank frame before Blink has eaten the picture, progress in a bubble beside Blink`, async () => {
    test.setTimeout(120000);
    const { app, page } = await launch();
    const started = Date.now();
    const rec = record(kind === "page" ? "eat_mouth" : "eat_mouth_hotkey", {
      fps: 30,
      suffix: "-322",
    });
    try {
      await background(app);
      await app.evaluate(() => {
        globalThis.blinklingTest.features.setSession({
          subscribe: () => () => {},
          send: async () => {},
          stop: async () => {},
        });
      });
      await page.waitForTimeout(800);
      await slow(app, kind, 2500);
      await watch(app);
      await app.evaluate(() => void globalThis.blinklingTest.features.select());
      if (kind === "page") {
        await expect(status(page)).toHaveAttribute("data-shown", "true", {
          timeout: 4000,
        });
        await expect(status(page)).toHaveText(line("pageWorking"));
      } else {
        // The selection is still open: nothing has been said yet.
        await sleep(1000);
        expect(
          await status(page).getAttribute("data-shown"),
          "no progress while the reader is still choosing",
        ).not.toBe("true");
      }
      await expect
        .poll(() => app.evaluate(() => globalThis.eatLog.delivered), {
          timeout: 15000,
        })
        .not.toBeNull();
      await expect
        .poll(() => app.evaluate(() => globalThis.eatLog.card), {
          timeout: 15000,
        })
        .not.toBeNull();
      const { delivered, card } = await app.evaluate(() => globalThis.eatLog);
      console.log(
        `${kind}: card opened ${card - delivered} ms after the picture was handed over`,
      );
      expect(
        card - delivered,
        "the card stays shut until the eat is over",
      ).toBeGreaterThan(400);
      await sleep(500);
      await rec.stop();
      // No frame of the recording before the picture was handed over shows a
      // card: the bubble is small, the card is big.
      const files = rec.sequence();
      const big = files.map(paperOf).findIndex((n) => n > 30000);
      expect(big, "the card is seen at the end").toBeGreaterThan(0);
      // The recording starts a little before `started`; allow half a second.
      const handed = ((delivered - started) / 1000) * 30;
      expect(
        big,
        "no frame shows the card before the picture has been handed to Blink",
      ).toBeGreaterThan(handed + 0.4 * 30 - 15);
    } finally {
      await app.close();
    }
  });
}
