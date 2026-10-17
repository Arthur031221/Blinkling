import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch } from "./support.mjs";
import { background, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";
import { install, marks, collect, writeRows, holdRows } from "./perf-kit.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const picture = () => {
  const png = new PNG({ width: 360, height: 240 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([30, 140, 90, 255], i);
  return PNG.sync.write(png).toString("base64");
};
const MARK = {
  opus: "#c9374d",
  sonnet: 'fill-opacity=".18"',
  haiku: "#ee6a56",
  fable: "#7c5fc4",
};
const outfit = (page) =>
  page.evaluate((marks) => {
    const svg = document.querySelector("svg").innerHTML;
    return Object.entries(marks)
      .filter(([, m]) => svg.includes(m))
      .map(([name]) => name);
  }, MARK);
const poses = (page) =>
  page.evaluate(() => {
    window.__keys = [];
    const step = () => {
      const key = window.desktop.character.key();
      if (window.__keys.at(-1) !== key) window.__keys.push(key);
      requestAnimationFrame(step);
    };
    step();
  });

test("changing the model or the effort dresses Blink and plays a move, then it goes back to normal, and a first look or the same value does nothing", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("model_costume", { suffix: "-323", fps: 8 });
  try {
    await background(app);
    await page.waitForTimeout(1500);
    // The card opens with a capture; the pick comes from its model menu's API.
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
    await sleep(6000);
    await poses(page);
    await install(page);
    // Startup and a quiet Blink: no outfit, no costume pose.
    expect(await outfit(page)).toEqual([]);
    expect(
      (await page.evaluate(() => window.__keys)).some((k) =>
        k.startsWith("costume:"),
      ),
    ).toBe(false);
    const rows = {};
    const picks = [
      ["opus", "low"],
      ["sonnet", "medium"],
      ["haiku", "high"],
      ["fable", "xhigh"],
      ["opus", "max"],
    ];
    for (const [family, effort] of picks) {
      await marks([page], `costume_${effort}`);
      await card.evaluate((s) => window.blinkling.select(s), {
        model: family,
        effort,
      });
      await expect
        .poll(() => page.evaluate(() => window.__keys.at(-1)), {
          timeout: 3000,
        })
        .toBe(`costume:${effort}`);
      rec.frame(`${family}-${effort}-move`);
      await sleep(2500);
      expect(await outfit(page)).toEqual([family]);
      rec.frame(`${family}-${effort}-worn`);
      // Back to default within about 4 to 6 seconds of the pick.
      await expect.poll(() => outfit(page), { timeout: 4500 }).toEqual([]);
      rows[`costume_${effort}`] = await collect(
        [page],
        `costume_${effort}`,
        [],
      );
      await sleep(600);
    }
    writeRows({ "100%": rows });
    holdRows(expect, rows);
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
});
