import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch } from "./support.mjs";
import { background, reveal, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";

const pageOf = (app, name) => app.windows().find((p) => p.url().includes(name));
const pid = (app) => app.evaluate(() => process.pid);

/** The drawn character as an alpha mask, with the speech bubbles hidden. */
async function mask(page) {
  const png = PNG.sync.read(await page.screenshot({ omitBackground: true }));
  const out = new Uint8Array(png.width * png.height);
  for (let i = 0; i < out.length; i++) out[i] = png.data[i * 4 + 3] > 8 ? 1 : 0;
  return out;
}
const differing = (a, b) => a.reduce((n, v, i) => n + (v === b[i] ? 0 : 1), 0);

test("switching the language in the settings page changes every window in place: no reload, no restart, no cut legs, no replayed jump or wave", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("language_switch");
  try {
    await background(app);
    await reveal(page);
    // Open the card so its labels can be compared too.
    await page.evaluate(() =>
      window.blinkling.shell({ type: "click", permission: true }),
    );
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
      )
      .toBe(true);
    const card = pageOf(app, "surface=card");
    await app.evaluate(() => globalThis.blinklingTest.settings.open());
    await expect.poll(() => pageOf(app, "/settings/index.html")).toBeTruthy();
    const settings = pageOf(app, "/settings/index.html");
    await page.waitForTimeout(1500);

    const mark = () => {
      window.__alive = "same page";
      window.__events = [];
      addEventListener("blinkling:shell-event", (e) => {
        if (e.detail.type !== "cursor") window.__events.push(e.detail.type);
      });
    };
    await page.evaluate(mark);
    await card.evaluate(() => (window.__alive = "same page"));
    await sleep(2500);
    const main = await pid(app);
    const before = await mask(page);
    const labels = async () => ({
      placeholder: await card.locator("textarea").getAttribute("placeholder"),
      select: await settings.locator("#language-select").inputValue(),
      title: await settings
        .locator("#language-select")
        .getAttribute("aria-label"),
    });
    const seen = [await labels()];
    rec.frame("zh-TW");

    for (const code of ["ja", "de", "en"]) {
      await settings.locator("#language-select").selectOption(code);
      await expect.poll(async () => (await labels()).select).toBe(code);
      await expect
        .poll(async () => (await labels()).placeholder)
        .not.toBe(seen.at(-1).placeholder);
      await sleep(900);
      const now = await labels();
      seen.push(now);
      rec.frame(code);
      // Same process, same pages, nothing reloaded.
      expect(await pid(app)).toBe(main);
      expect(await page.evaluate(() => window.__alive)).toBe("same page");
      expect(await card.evaluate(() => window.__alive)).toBe("same page");
      // The character is still the same drawing: legs whole, not re-appearing.
      const after = await mask(page);
      expect(differing(before, after)).toBeLessThan(before.length * 0.002);
      const motions = await page.evaluate(() => window.__events);
      expect(motions).not.toContain("appear");
      expect(motions).not.toContain("wave");
    }
    // Four different languages, four different texts.
    expect(new Set(seen.map((s) => s.placeholder)).size).toBe(4);
    expect(new Set(seen.map((s) => s.title)).size).toBe(4);
  } finally {
    await rec.stop();
    await app.close();
  }
});
