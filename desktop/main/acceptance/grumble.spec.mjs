import { test, expect } from "@playwright/test";
import { launch, move } from "./support.mjs";
import { background } from "./helpers.mjs";
import { record } from "./record.mjs";

const place = (app, edge, ratio) =>
  app.evaluate(
    async ({ screen }, [edge, ratio]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    [edge, ratio],
  );

/** The visible part of the head and the bubble, in window pixels. */
const boxes = (page) =>
  page.evaluate(() => {
    const clip = (r) => ({
      left: Math.max(0, r.left),
      right: Math.min(innerWidth, r.right),
      top: Math.max(0, r.top),
      bottom: Math.min(innerHeight, r.bottom),
    });
    return {
      head: clip(document.querySelector(".blink-body").getBoundingClientRect()),
      bubble: document
        .querySelector("#grumble")
        .getBoundingClientRect()
        .toJSON(),
      screen: { w: innerWidth, h: innerHeight },
    };
  });

for (const edge of ["bottom", "right", "top", "left"])
  test(`after a quiet minute Blink grumbles from the ${edge} edge: the bubble is beside the peeking head and Blink does not come out`, async () => {
    test.setTimeout(120000);
    const { app, page } = await launch();
    const rec = record("grumble", { suffix: `-323-${edge}`, fps: 6 });
    try {
      await background(app);
      await place(app, edge, 0.5);
      move(20, 20);
      await page.waitForTimeout(1800);
      rec.frame("peek");
      const bubble = page.locator("#grumble");
      await expect(bubble).toHaveAttribute("data-shown", "false");
      const modes = [];
      await page.exposeFunction("seen", (m) => modes.push(m));
      await page.evaluate(() => {
        const node = document.querySelector("#blink");
        new MutationObserver(() => window.seen(node.dataset.mode)).observe(
          node,
          { attributes: true, attributeFilter: ["data-mode"] },
        );
      });
      // The quiet minute counts from a minute ago instead of waiting it out.
      await page.evaluate(() =>
        window.desktop.grumbler.touch(performance.now() - 61_000),
      );
      await expect(bubble).toHaveAttribute("data-shown", "true");
      await page.waitForTimeout(1500);
      rec.frame("grumbling");
      await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek");
      const pose = await page.evaluate(() => ({
        key: window.desktop.character.last.key,
        lid: window.desktop.character.last.lid,
      }));
      expect(pose.lid).toBeGreaterThan(0.2);
      const { head, bubble: b, screen } = await boxes(page);
      expect(head.right - head.left, "some of the head shows").toBeGreaterThan(
        10,
      );
      expect(b.width).toBeGreaterThan(40);
      // Beside the head: level with it, clear of it, and inside the screen.
      const apart = b.left >= head.right - 1 || b.right <= head.left + 1;
      expect(
        apart,
        `bubble ${JSON.stringify(b)} against head ${JSON.stringify(head)}`,
      ).toBe(true);
      const level = Math.min(b.bottom, head.bottom) - Math.max(b.top, head.top);
      expect(level, "the bubble is level with the head").toBeGreaterThan(8);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(screen.w);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(screen.h);
      await page.waitForTimeout(3500);
      rec.frame("later");
      // The line goes after a few seconds; Blink never left the edge.
      await expect(bubble).toHaveAttribute("data-shown", "false", {
        timeout: 15000,
      });
      expect(modes.filter((m) => m !== "peek")).toEqual([]);
      rec.frame("gone");
    } finally {
      await rec.stop();
      await app.close();
    }
  });

test("left alone for a real minute, with the connection up and nothing running, Blink grumbles by itself from its edge", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("grumble_idle", { suffix: "-323", fps: 4 });
  try {
    await background(app);
    await app.evaluate(() =>
      globalThis.blinklingTest.send({ type: "status", state: "connected" }),
    );
    move(20, 20);
    await page.waitForTimeout(1500);
    rec.frame("start");
    const bubble = page.locator("#grumble");
    await expect(bubble).toHaveAttribute("data-shown", "false");
    // No shortcut: the quiet minute is waited out.
    const began = Date.now();
    await expect(bubble).toHaveAttribute("data-shown", "true", {
      timeout: 90000,
    });
    expect(Date.now() - began).toBeGreaterThan(50_000);
    await page.waitForTimeout(1500);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek");
    rec.frame("grumbling");
    await expect(bubble).toHaveAttribute("data-shown", "false", {
      timeout: 15000,
    });
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek");
    rec.frame("gone");
  } finally {
    await rec.stop();
    await app.close();
  }
});
