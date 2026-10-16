import { test, expect } from "@playwright/test";
import { launch, shot } from "./support.mjs";

const thinking = { type: "guide", phase: "thinking" };

test("the guide line sits inside the card and is not rebuilt", async () => {
  const { app, card, errors } = await launch();
  try {
    const page = card;
    await app.evaluate(
      (_e, ev) => globalThis.conversationTest.emit(ev),
      thinking,
    );
    const pill = page.locator(".gl-guide .gl-answer-bubble");
    await expect(pill).toBeVisible();
    await page.waitForTimeout(600);
    const inside = await pill.evaluate((el) => {
      const guide = el.closest(".gl-guide").getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return box.left >= guide.left - 0.5 && box.right <= guide.right + 0.5;
    });
    expect(inside).toBe(true);
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
