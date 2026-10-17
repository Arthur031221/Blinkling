import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch } from "./support.mjs";
import { background, clickBlink, onBlink, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";
import { strings } from "../../composer/strings.mjs";

const all = (key) => Object.values(strings).map((t) => t[key]);
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const picture = () => {
  const png = new PNG({ width: 360, height: 240 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([30, 140, 90, 255], i);
  return PNG.sync.write(png).toString("base64");
};
/** Every window that holds a text box, visible or not, and how many show. */
const boxes = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed())
      .map((w) => ({
        url: w.webContents.getURL(),
        visible: w.isVisible(),
      }))
      .filter((w) => /composer\/index|mini/.test(w.url)),
  );
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

test("one composer on screen: a capture goes into the card's own box, Enter on an empty box sends the highlighted chip, typed words win", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("one_composer", { suffix: "-324" });
  try {
    await background(app);
    await page.waitForTimeout(800);
    await capture(app, "one");
    await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
    const card = cardPage(app);
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    await sleep(700);
    rec.frame("one-box");
    // Exactly one text box is on screen, and it is the card's.
    const windows = await boxes(app);
    expect(windows.filter((w) => w.visible)).toHaveLength(1);
    expect(windows.some((w) => /mini/.test(w.url))).toBe(false);
    expect(await card.locator("textarea:visible").count()).toBe(1);
    // The quick chips are there, one of them highlighted.
    await expect(card.locator(".gl-quick-chip")).toHaveCount(3);
    await expect(
      card.locator('.gl-quick-chip[data-default="true"]'),
    ).toHaveCount(1);
    // Enter on the empty box sends the highlighted chip's exact words.
    const said = () =>
      card.locator(".gl-user").evaluateAll((rows) =>
        rows.map((row) => {
          const copy = row.cloneNode(true);
          copy.querySelector(".gl-message-meta")?.remove();
          return copy.textContent;
        }),
      );
    await expect
      .poll(async () => (await said()).length, { timeout: 30000 })
      .toBe(0);
    await card.locator(".gl-input").focus();
    await card.keyboard.press("Enter");
    await expect.poll(async () => (await said()).length).toBe(1);
    expect(all("quick-what")).toContain((await said())[0].trim());
    rec.frame("sent");
    await expect(card.locator(".gl-assistant").last()).toContainText(/\S/, {
      timeout: 30000,
    });
    // A second capture, typed words: the typed words are sent, not the chip.
    await capture(app, "two");
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    await card.locator(".gl-input").fill("What is the green?");
    await card.keyboard.press("Enter");
    await expect.poll(async () => (await said()).length).toBe(2);
    expect((await said())[1]).toContain("What is the green?");
    await sleep(600);
    rec.frame("typed");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("clicking Blink opens the one card and never a second surface, with or without a capture", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("one_composer", { suffix: "-324", fps: 6 });
  try {
    await background(app);
    await page.waitForTimeout(800);
    const seen = new Set();
    const watch = async () => {
      for (const w of await boxes(app)) if (w.visible) seen.add(w.url);
    };
    await onBlink(page);
    await watch();
    expect(seen.size, "nothing has a text box before the click").toBe(0);
    await clickBlink(page);
    await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
    const card = cardPage(app);
    await expect(card.locator("textarea:visible")).toHaveCount(1);
    for (let i = 0; i < 6; i++) {
      await watch();
      await sleep(150);
    }
    rec.frame("click");
    // A capture while the card is open goes into the same box.
    await capture(app, "inside");
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    await expect(card.locator(".gl-quick-chip")).toHaveCount(3);
    for (let i = 0; i < 6; i++) {
      await watch();
      await sleep(150);
    }
    rec.frame("capture");
    // Blink is a click away again: still no second surface.
    await clickBlink(page);
    await sleep(600);
    await watch();
    rec.frame("again");
    expect([...seen], "one window holds the composer").toHaveLength(1);
    expect(
      await app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter(
            (w) =>
              !w.isDestroyed() &&
              w.isVisible() &&
              /mini|quick/.test(w.webContents.getURL()),
          ).length,
      ),
    ).toBe(0);
  } finally {
    await rec.stop();
    await app.close();
  }
});
