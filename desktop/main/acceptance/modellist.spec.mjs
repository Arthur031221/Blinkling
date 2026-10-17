import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch } from "./support.mjs";
import { background, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const picture = () => {
  const png = new PNG({ width: 360, height: 240 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([30, 140, 90, 255], i);
  return PNG.sync.write(png).toString("base64");
};

test("the model list offers Opus, Sonnet, Haiku and Fable, each with its version, and a pick shows its version on the line", async () => {
  test.setTimeout(90000);
  const { app, page } = await launch();
  const rec = record("model_list", { suffix: "-324", fps: 6 });
  try {
    await background(app);
    await page.waitForTimeout(1500);
    await app.evaluate(
      async ({ screen }, data) =>
        globalThis.blinklingTest.attachCapture({
          image: { id: "c", name: "a.png", mediaType: "image/png", data },
          display: screen.getPrimaryDisplay(),
          region: { x: 300, y: 200, width: 360, height: 240 },
        }),
      picture(),
    );
    await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
    const card = cardPage(app);
    await sleep(2500);
    await card.getByRole("button", { name: /^模型/ }).click();
    const list = card.getByRole("listbox", { name: "模型" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveText([
      "Opus 5.5",
      "Sonnet 5.5",
      "Haiku 4.5",
      "Fable 5.1",
    ]);
    await sleep(1200);
    rec.frame("list");
    await list.getByRole("option", { name: "Fable 5.1" }).click();
    await sleep(1200);
    await expect(card.getByRole("button", { name: /^模型/ })).toContainText(
      "Fable 5.1",
    );
    rec.frame("picked");
    await sleep(1500);
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
});
