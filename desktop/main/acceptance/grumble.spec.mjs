import { test, expect } from "@playwright/test";
import { launch, move } from "./support.mjs";
import { background } from "./helpers.mjs";
import { record } from "./record.mjs";

test("after a quiet minute Blink comes out, stands and grumbles in a bubble, then goes back to its edge", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("grumble", { suffix: "-321" });
  try {
    await background(app);
    move(20, 20);
    await page.waitForTimeout(1500);
    rec.frame("peek");
    const bubble = page.locator("#grumble");
    await expect(bubble).toHaveAttribute("data-shown", "false");
    // The quiet minute counts from a minute ago instead of waiting it out.
    await page.evaluate(() =>
      window.desktop.grumbler.touch(performance.now() - 61_000),
    );
    await expect(bubble).toHaveAttribute("data-shown", "true");
    // Blink walks out to stand while it grumbles.
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(1500);
    rec.frame("grumbling");
    const pose = await page.evaluate(() => ({
      key: window.desktop.character.last.key,
      eyes: window.desktop.character.last.eyes,
      lid: window.desktop.character.last.lid,
    }));
    expect(pose.lid).toBeGreaterThan(0.2);
    const box = await bubble.boundingBox();
    expect(box.width).toBeGreaterThan(40);
    await page.waitForTimeout(3500);
    rec.frame("later");
    // The line goes after a few seconds and Blink goes back to the edge.
    await expect(bubble).toHaveAttribute("data-shown", "false", {
      timeout: 15000,
    });
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 15000,
    });
    rec.frame("gone");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("left alone for a real minute, with the connection up and nothing running, Blink comes out and grumbles by itself", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("grumble_idle", { suffix: "-321", fps: 4 });
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
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(1500);
    rec.frame("grumbling");
    await expect(bubble).toHaveAttribute("data-shown", "false", {
      timeout: 15000,
    });
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 15000,
    });
    rec.frame("gone");
  } finally {
    await rec.stop();
    await app.close();
  }
});
