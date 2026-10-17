import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { launch } from "./support.mjs";
import { background, reveal, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";

const flag = JSON.parse(readFileSync("config/flag.json", "utf8"));
const pageOf = (app, name) => app.windows().find((p) => p.url().includes(name));

test("Settings help shows the start command and the one plain line, in the language you pick", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("flag", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    await app.evaluate(() => globalThis.blinklingTest.settings.open());
    await expect.poll(() => pageOf(app, "/settings/index.html")).toBeTruthy();
    const settings = pageOf(app, "/settings/index.html");
    const sync = settings.locator(".settings-sync");
    await settings.locator("#language-select").selectOption("en");
    await sync.scrollIntoViewIfNeeded();
    await sleep(800);
    await expect(sync.locator("code")).toHaveText(flag.command);
    await expect(sync.locator("p")).toHaveText(flag.line.en);
    expect(await sync.isVisible()).toBe(true);
    // The command sits fully inside the window, wrapped, not cut off.
    const fits = await sync.evaluate((el) => {
      const code = el.querySelector("code").getBoundingClientRect();
      return code.right <= window.innerWidth && code.left >= 0;
    });
    expect(fits).toBe(true);
    rec.frame("en");
    for (const code of ["zh-TW", "ja", "de"]) {
      await settings.locator("#language-select").selectOption(code);
      await expect(sync.locator("p")).toHaveText(flag.line[code]);
      await expect(sync.locator("code")).toHaveText(flag.command);
      await sync.scrollIntoViewIfNeeded();
      await sleep(900);
      rec.frame(code);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
