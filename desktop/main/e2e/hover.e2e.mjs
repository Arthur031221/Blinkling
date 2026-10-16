import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { launch, native, moveOn, wheel, rigPoint } from "./support.mjs";

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
        .poll(() => app.evaluate(() => globalThis.blinklingTest.cursor()))
        .toEqual({ x: Math.round(300 / scale), y: Math.round(300 / scale) });
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-mode",
        "peek",
        { timeout: 2500 },
      );
      expect(Date.now() - from).toBeLessThan(2600);
      await expect
        .poll(() =>
          app.evaluate(() => globalThis.blinklingTest.snapshot().pinned),
        )
        .toBe(false);
    } finally {
      other.kill();
      await c.close();
    }
  });

test("H-1 the native wheel scrolls the card history and the card keeps working after the pointer left Blink", async () => {
  const c = await launch();
  const { app, page } = c;
  const other = await otherApp();
  try {
    await app.evaluate(() => {
      const { session } = globalThis.blinklingTest;
      for (let i = 1; i <= 24; i++)
        session.emit({
          type: "message",
          id: `m${i}`,
          role: i % 2 ? "user" : "assistant",
          content: [{ type: "text", text: `Message ${i}.` }],
        });
      // The newest answer is what opens the card.
      session.emit({ type: "delta", id: "latest", text: "Latest answer." });
    });
    const card = async () => {
      for (const w of await app.windows())
        if (w.url().includes("surface=card")) return w;
      return null;
    };
    await expect.poll(async () => !!(await card())).toBe(true);
    const cardPage = await card();
    const list = cardPage.locator(".gl-chat-history");
    await expect(cardPage.locator(".gl-chat-message")).toHaveCount(25);
    await expect
      .poll(() =>
        list.evaluate((node) => node.scrollHeight > node.clientHeight),
      )
      .toBe(true);
    const box = await list.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const origin = await app.evaluate(() => {
      const b = globalThis.blinklingTest.composer.getBounds();
      return { x: b.x, y: b.y };
    });
    // Park the pointer on the other client first, then come back onto the card.
    native(300, 300);
    await page.waitForTimeout(300);
    const before = await list.evaluate((node) => node.scrollTop);
    wheel(origin.x + box.x, origin.y + box.y, 8);
    await expect
      .poll(() => list.evaluate((node) => node.scrollTop))
      .toBeLessThan(before);
  } finally {
    other.kill();
    await c.close();
  }
});

const edges = [
  ["left", 38, 400],
  ["right", 1262, 420],
  ["top", 640, 4],
  ["bottom", 640, 796],
];
for (const [edge, x, y] of edges)
  test(`H-2 dragging Blink to the ${edge} edge moves the open card with it`, async () => {
    const c = await launch();
    const { app, page } = c;
    try {
      await app.evaluate(() =>
        globalThis.blinklingTest.session.emit({
          type: "delta",
          id: "answer",
          text: "Hello.",
        }),
      );
      await expect
        .poll(() =>
          app.evaluate(() => globalThis.blinklingTest.composer?.isVisible()),
        )
        .toBe(true);
      await moveOn(page);
      const p = await rigPoint(page);
      native(p.x, p.y, "down");
      native(p.x - 40, p.y - 30);
      await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
      native(x, y);
      await page.waitForTimeout(150);
      native(x, y, "up");
      await expect
        .poll(() =>
          app.evaluate(() => globalThis.blinklingTest.snapshot().position.edge),
        )
        .toBe(edge);
      const card = await app.evaluate(() =>
        globalThis.blinklingTest.cardBounds(),
      );
      await expect
        .poll(() =>
          app.evaluate(() => globalThis.blinklingTest.composer.getBounds()),
        )
        .toEqual(card);
    } finally {
      await c.close();
    }
  });

test("H-3 every menu bubble is clickable while the card is open", async () => {
  const c = await launch();
  const { app, page } = c;
  try {
    const actions = await page.evaluate(() =>
      [...document.querySelectorAll("[data-action]")].map(
        (b) => b.dataset.action,
      ),
    );
    expect(actions).toEqual([
      "capture",
      "guide",
      "auto-explain",
      "settings",
      "quit",
    ]);
    await app.evaluate((_, ids) => {
      globalThis.pillCalls = [];
      for (const id of ids)
        globalThis.blinklingTest.registerAction(id, async () => {
          globalThis.pillCalls.push(id);
        });
      const text = Array.from({ length: 12 }, (_, i) => `Sentence ${i + 1}.`);
      globalThis.blinklingTest.session.emit({
        type: "delta",
        id: "answer",
        text: text.join(" "),
      });
    }, actions);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.composer?.isVisible()),
      )
      .toBe(true);
    const shown = (pill) =>
      pill.evaluate((el) => Number(getComputedStyle(el).opacity));
    for (const action of actions) {
      await moveOn(page);
      const pill = page.locator(`[data-action="${action}"]`);
      // One click on Blink swaps the open card for the menu bubbles.
      if ((await shown(pill)) < 0.5) {
        const p = await rigPoint(page);
        native(p.x, p.y, "click");
      }
      await expect.poll(() => shown(pill)).toBeGreaterThan(0.95);
      const r = await pill.boundingBox();
      native(r.x + r.width / 2, r.y + r.height / 2, "click");
      await expect
        .poll(() => app.evaluate(() => globalThis.pillCalls), {
          message: `bubble ${action}`,
        })
        .toContain(action);
      native(20, 20);
      await page.waitForTimeout(150);
    }
  } finally {
    await c.close();
  }
});
