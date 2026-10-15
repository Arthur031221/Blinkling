import { test, expect } from "@playwright/test";
import { launch, shot } from "./support.mjs";

const thinking = { type: "guide", phase: "thinking" };
const bubblesPage = async (app) => (await app.windows())[1];

test("the guide pill is as wide as its text plus padding and is not rebuilt", async () => {
  const { app, errors } = await launch();
  try {
    await app.evaluate(() => globalThis.conversationTest.bubbles());
    const page = await bubblesPage(app);
    await app.evaluate(
      (_e, ev) => globalThis.conversationTest.emit(ev),
      thinking,
    );
    const pill = page.locator(".gl-guide .gl-answer-bubble");
    await expect(pill).toBeVisible();
    await page.waitForTimeout(600);
    const measure = () =>
      pill.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect().width;
        const style = getComputedStyle(el);
        const pad =
          parseFloat(style.paddingLeft) +
          parseFloat(style.paddingRight) +
          parseFloat(style.borderLeftWidth) +
          parseFloat(style.borderRightWidth);
        return { box: el.getBoundingClientRect().width, text, pad };
      });
    const first = await measure();
    expect(Math.abs(first.box - (first.text + first.pad))).toBeLessThan(1.5);
    await shot(app, "guide-pill");
    // The same event again must update the pill where it is, not replace it.
    const handle = await pill.elementHandle();
    await app.evaluate(
      (_e, ev) => globalThis.conversationTest.emit(ev),
      thinking,
    );
    await page.waitForTimeout(50);
    expect(await handle.evaluate((el) => el.isConnected)).toBe(true);
    const opacity = await pill.evaluate((el) => {
      let o = 1;
      for (let n = el; n; n = n.parentElement)
        o *= Number(getComputedStyle(n).opacity);
      return o;
    });
    expect(opacity).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
