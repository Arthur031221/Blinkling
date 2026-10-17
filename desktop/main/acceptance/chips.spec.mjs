import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch } from "./support.mjs";
import { background, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";
import { strings } from "../../composer/strings.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const picture = () => {
  const png = new PNG({ width: 360, height: 240 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([30, 140, 90, 255], i);
  return PNG.sync.write(png).toString("base64");
};
const capture = (app, id) =>
  app.evaluate(
    async ({ screen }, [data, id]) => {
      const d = screen.getPrimaryDisplay();
      await globalThis.blinklingTest.attachCapture({
        image: { id, name: "Selection.png", mediaType: "image/png", data },
        display: d,
        region: { x: 300, y: 200, width: 360, height: 240 },
      });
    },
    [picture(), id],
  );

test("each quick chip sends exactly the words on it, with no length words added", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("chips_exact", { suffix: "-323" });
  try {
    await background(app);
    await page.waitForTimeout(800);
    const words = [
      strings["zh-TW"]["quick-what"],
      strings["zh-TW"]["quick-translate"],
      strings["zh-TW"]["quick-summary"],
    ];
    for (const [i, word] of words.entries()) {
      await capture(app, `c${i}`);
      await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
      const card = cardPage(app);
      await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
      await sleep(500);
      await card.locator(".gl-quick-chip", { hasText: word }).click();
      await expect(card.locator(".gl-user")).toHaveCount(i + 1);
      // The line in the chat is the chip's words and nothing else.
      expect((await card.locator(".gl-user").last().innerText()).trim()).toBe(
        word,
      );
      await expect(card.locator(".gl-assistant")).toHaveCount(i + 1, {
        timeout: 30000,
      });
      await sleep(500);
      rec.frame(`sent-${i}`);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("a full page capture is one page chip in the composer and its tiles still go out as pictures", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("full_page_chip", { suffix: "-323" });
  try {
    await background(app);
    await page.waitForTimeout(800);
    await app.evaluate(async ({ screen }, data) => {
      const display = screen.getPrimaryDisplay();
      const tile = (id) => ({
        id: `capture-${id}`,
        kind: "page",
        source: "page",
        display,
        region: { x: 300, y: 100, width: 600, height: 500 },
        image: { id, name: "Page.png", mediaType: "image/png", data },
      });
      await globalThis.blinklingTest.attachCapture({
        ...tile("t0"),
        rest: [tile("t1"), tile("t2")],
      });
    }, picture());
    await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
    const card = cardPage(app);
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    await expect(card.locator(".gl-attachment-name")).toHaveText(
      strings["zh-TW"]["page-chip"].replace("{count}", "3"),
    );
    await sleep(600);
    rec.frame("one-chip");
    await card.locator(".gl-quick-chip").first().click();
    await expect(card.locator(".gl-user .gl-message-image")).toHaveCount(3);
    await sleep(600);
    rec.frame("sent");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("a new capture takes the marks of the last answer off the screen before the card opens", async () => {
  test.setTimeout(60000);
  const { app, page } = await launch();
  try {
    await background(app);
    await page.waitForTimeout(800);
    await app.evaluate(() => {
      const { features } = globalThis.blinklingTest;
      globalThis.cleared = [];
      const clear = features.pointing.clear.bind(features.pointing);
      features.pointing.clear = (reason) => {
        globalThis.cleared.push(reason);
        return clear(reason);
      };
    });
    await capture(app, "marks");
    await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
    expect(await app.evaluate(() => globalThis.cleared)).toContain(
      "new-capture",
    );
  } finally {
    await app.close();
  }
});
