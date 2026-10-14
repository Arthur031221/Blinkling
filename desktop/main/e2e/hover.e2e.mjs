import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { launch, native, moveOn, wheel } from "./support.mjs";

/** An X client that is not Electron: the situation where the pointer query of
 * Electron's own API used to go stale. */
async function otherApp() {
  const child = spawn("xmessage", [
    "-geometry",
    "700x500+100+100",
    "another app",
  ]);
  await new Promise((resolve) => setTimeout(resolve, 800));
  return child;
}

for (const scale of [1, 1.5])
  test(`H-1 hover ends over another app and the pointer is exact at ${scale * 100}%`, async () => {
    const c = await launch(scale);
    const { app, page } = c;
    const other = await otherApp();
    try {
      await moveOn(page, scale);
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-mode",
        "hover",
      );
      const from = Date.now();
      native(300, 300);
      await expect
        .poll(() => app.evaluate(() => globalThis.glimpseletTest.cursor()))
        .toEqual({ x: Math.round(300 / scale), y: Math.round(300 / scale) });
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-mode",
        "peek",
        { timeout: 2500 },
      );
      expect(Date.now() - from).toBeLessThan(2600);
      await expect
        .poll(() =>
          app.evaluate(() => globalThis.glimpseletTest.snapshot().pinned),
        )
        .toBe(false);
    } finally {
      other.kill();
      await c.close();
    }
  });

test("H-1 the native wheel scrolls the bubble deck and the deck keeps working after the pointer left Blink", async () => {
  const c = await launch();
  const { app, page } = c;
  const other = await otherApp();
  try {
    const sentences = Array.from(
      { length: 16 },
      (_, i) => `Sentence ${i + 1}.`,
    );
    await app.evaluate((_, text) => {
      const { send } = globalThis.glimpseletTest;
      send({ type: "delta", id: "answer", text });
    }, sentences.join(" "));
    const deck = async () => {
      for (const w of await app.windows()) {
        const el = w.locator(".gl-bubble-deck");
        if (await el.count()) return { page: w, el };
      }
      return null;
    };
    await expect.poll(async () => !!(await deck())).toBe(true);
    const { page: bubbles, el } = await deck();
    await expect
      .poll(() => bubbles.locator(".gl-answer-bubble").count())
      .toBeGreaterThanOrEqual(16);
    await moveOn(page);
    const box = await el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const origin = await app.evaluate(() => {
      const b = globalThis.glimpseletTest.bubbles.getBounds();
      return { x: b.x, y: b.y };
    });
    // Park the pointer on the other client first, then come back onto the deck.
    native(300, 300);
    await page.waitForTimeout(300);
    const before = await el.evaluate((node) => node.scrollTop);
    wheel(origin.x + box.x, origin.y + box.y, 8);
    await expect
      .poll(() => el.evaluate((node) => node.scrollTop))
      .toBeLessThan(before);
  } finally {
    other.kill();
    await c.close();
  }
});
