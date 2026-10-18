import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch } from "./support.mjs";
import { background, onBlink, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const pageOf = (app, name) => app.windows().find((p) => p.url().includes(name));
const picture = () => {
  const png = new PNG({ width: 360, height: 240 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([30, 140, 90, 255], i);
  return PNG.sync.write(png).toString("base64");
};
// One mark per model piece, found in the character's own drawing.
const MARK = {
  opus: "#c9374d",
  sonnet: 'fill-opacity=".12"',
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
const keysOf = (page) => page.evaluate(() => window.__keys);
const watch = (page) =>
  page.evaluate(() => {
    window.__keys = [];
    const step = () => {
      const key = window.desktop.character.key();
      if (window.__keys.at(-1) !== key) window.__keys.push(key);
      requestAnimationFrame(step);
    };
    step();
  });
// Peak prop count seen on any frame, so a slow machine cannot miss the show.
const peak = (page) =>
  page.evaluate(() => {
    window.__peak = 0;
    const step = () => {
      window.__peak = Math.max(
        window.__peak,
        document.querySelectorAll(".prop").length,
      );
      requestAnimationFrame(step);
    };
    step();
  });
const around = async (page) => {
  const b = await page.evaluate(() => {
    const r = document.querySelector(".blink-body").getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const w = 420,
    h = 380;
  const x = Math.max(0, Math.round(b.x - w / 2));
  const y = Math.max(0, Math.round(b.y - h * 0.62));
  return `${w}:${h}:${x}:${y}`;
};
const open = async (app) => {
  await background(app);
  await sleep(1500);
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
  return cardPage(app);
};
const pick = (card, model, effort) =>
  card.evaluate((s) => window.blinkling.select(s), { model, effort });

test("a model change plays that model's scene once and leaves only its piece on, the same value or a first look does nothing, and the Settings switch turns it off", async () => {
  test.setTimeout(300000);
  const { app, page } = await launch();
  const rec = record("costume_v2", { suffix: "-324", fps: 10 });
  try {
    const card = await open(app);
    await sleep(5000);
    await watch(page);
    // A quiet Blink at startup plays nothing; it wears at most the chosen model's piece.
    expect((await outfit(page)).length).toBeLessThanOrEqual(1);
    expect((await keysOf(page)).some((k) => k.startsWith("costume:"))).toBe(
      false,
    );
    const crop = await around(page);
    // The first pick from the default sets the baseline; same value again adds no scene.
    await pick(card, "sonnet", "medium");
    await sleep(3600);
    const base = (await keysOf(page)).filter((k) => k.startsWith("costume:"));
    await pick(card, "sonnet", "medium");
    await sleep(1200);
    expect(
      (await keysOf(page)).filter((k) => k.startsWith("costume:")),
    ).toEqual(base);
    for (const family of ["opus", "haiku", "fable", "sonnet", "haiku"]) {
      const before = (await keysOf(page)).length;
      await pick(card, family, "medium");
      await expect
        .poll(async () => (await keysOf(page)).slice(before).join(" "), {
          timeout: 6000,
        })
        .toContain(`costume:model:${family}`);
      // Frames through the scene, every 0.4 s.
      for (let i = 0; i < 7; i++) {
        rec.frame(`${family}-scene-${i}`, crop);
        await sleep(400);
      }
      await sleep(1200);
      const keys = (await keysOf(page)).slice(before);
      expect(keys.filter((k) => k.startsWith("costume:")).length).toBe(1);
      // The scene is over: only this model's piece stays.
      expect(await outfit(page)).toEqual([family]);
      rec.frame(`${family}-worn`, crop);
      await sleep(800);
    }
    // Switch costume effects off in Settings: the outfit goes and no scene plays.
    await app.evaluate(() => globalThis.blinklingTest.settings.open());
    await expect.poll(() => pageOf(app, "/settings/index.html")).toBeTruthy();
    const settings = pageOf(app, "/settings/index.html");
    await expect(settings.locator("#costume-switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await settings.locator("#costume-switch").click();
    await expect(settings.locator("#costume-switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect.poll(() => outfit(page), { timeout: 3000 }).toEqual([]);
    rec.frame("off-no-outfit", crop);
    const before = (await keysOf(page)).length;
    await pick(card, "fable", "high");
    await sleep(3500);
    expect(
      (await keysOf(page)).slice(before).some((k) => k.startsWith("costume:")),
    ).toBe(false);
    expect(await outfit(page)).toEqual([]);
    // And back on: the piece of the chosen model returns, without a replayed scene.
    await settings.locator("#costume-switch").click();
    await expect(settings.locator("#costume-switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await app.evaluate(() => globalThis.blinklingTest.settings.close());
    // Blink rests at the screen edge after Settings; the pointer brings it out.
    await onBlink(page);
    await expect.poll(() => outfit(page), { timeout: 8000 }).toEqual(["fable"]);
    rec.frame("on-again", crop);
    expect(
      (await keysOf(page)).slice(before).some((k) => k.startsWith("costume:")),
    ).toBe(false);
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
});

test("each effort level plays its own one-off show with props, the model's piece stays on through it, and the show ends by itself", async () => {
  test.setTimeout(300000);
  const { app, page } = await launch();
  const rec = record("effort_shows", { suffix: "-324", fps: 10 });
  try {
    const card = await open(app);
    await sleep(5000);
    await watch(page);
    const crop = await around(page);
    await pick(card, "haiku", "low");
    await sleep(4000);
    expect(await outfit(page)).toEqual(["haiku"]);
    const props = (p) =>
      p.evaluate(() => document.querySelectorAll(".prop").length);
    const lengths = { medium: 2.6, high: 3, xhigh: 3.4, max: 4, low: 2.2 };
    for (const effort of ["medium", "high", "xhigh", "max", "low"]) {
      const before = (await keysOf(page)).length;
      await peak(page);
      await pick(card, "haiku", effort);
      await expect
        .poll(async () => (await keysOf(page)).slice(before).join(" "), {
          timeout: 15000,
        })
        .toContain(`costume:effort:${effort}`);
      const n = Math.ceil(lengths[effort] / 0.35);
      for (let i = 0; i < n; i++) {
        rec.frame(`${effort}-show-${i}`, crop);
        await sleep(350);
      }
      const most = await page.evaluate(() => window.__peak);
      // Props appear during the show, the scarf and plane stay, and the show ends.
      expect(most).toBeGreaterThan(2);
      await sleep(1500);
      const keys = (await keysOf(page)).slice(before);
      expect(keys.filter((k) => k.startsWith("costume:")).length).toBe(1);
      expect(keys.at(-1).startsWith("costume:")).toBe(false);
      expect(await outfit(page)).toEqual(["haiku"]);
      expect(await props(page)).toBeLessThanOrEqual(2);
      rec.frame(`${effort}-after`, crop);
      await sleep(500);
    }
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
});
