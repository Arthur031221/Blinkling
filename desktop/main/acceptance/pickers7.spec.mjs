import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardOpen = (app) =>
  app.evaluate(() => {
    const c = globalThis.blinklingTest.composer;
    return Boolean(c && c.isVisible());
  });

/** Opens each of the three lists in turn and picks the last row that is not
 * the current one: the trigger text must follow the choice. */
async function changeAll(card) {
  const result = {};
  for (const [index, name] of ["model", "effort", "permission"].entries()) {
    const trigger = card.locator(".gl-picker-trigger").nth(index);
    await expect(trigger, `${name} enabled`).toBeEnabled();
    const before = (await trigger.textContent()).trim();
    await trigger.click();
    const rows = card.locator(
      ".gl-picker-menu:not([hidden]) .gl-picker-option",
    );
    await expect(rows.first()).toBeVisible();
    const texts = await rows.allTextContents();
    const pick = texts.findLastIndex((t) => t.trim() !== before);
    await rows.nth(pick).click();
    await expect
      .poll(async () => (await trigger.textContent()).trim(), name)
      .toBe(texts[pick].trim());
    result[name] = [before, texts[pick].trim()];
  }
  return result;
}

// The last case is a session that never connects (the claude program is not
// found), where the selection is unknown and the lists used to stay locked.
for (const [live, working, missing] of [
  [false, false, false],
  [true, false, false],
  [true, true, false],
  [false, false, true],
]) {
  test(`r7_pickers: model, effort and permission can all be changed ${live ? "in a live terminal session chat" : "in Blink's own chat"}${working ? " while an answer is running" : ""}${missing ? " before the session has connected" : ""}`, async () => {
    test.setTimeout(40000);
    const rec =
      live && working ? record("r7_pickers", { suffix: "-327" }) : null;
    const { app, page } = await launch(
      missing ? { env: { BLINKLING_CLAUDE: "/nonexistent/claude" } } : {},
    );
    try {
      if (missing)
        await app.evaluate(() => globalThis.blinklingTest.openComposer({}));
      else {
        await background(app);
        await reveal(page);
        await clickBlink(page);
      }
      await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
      await page.waitForTimeout(800);
      if (live) {
        await app.evaluate(() =>
          globalThis.blinklingTest.session.link({
            session: "s1",
            cwd: "/work/alpha",
            channel: true,
          }),
        );
        await page.waitForTimeout(800);
      }
      if (working)
        await app.evaluate(() =>
          globalThis.blinklingTest.session.turnStart({ session: "s1" }),
        );
      await page.waitForTimeout(400);
      const card = cardPage(app);
      rec?.frame("card");
      const changed = await changeAll(card);
      rec?.frame("changed");
      expect(Object.keys(changed)).toHaveLength(3);
    } finally {
      await rec?.stop();
      await app.close();
    }
  });
}
