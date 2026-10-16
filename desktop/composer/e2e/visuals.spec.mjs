import { test, expect } from "@playwright/test";
import { report, capture, launch, shot, bounds } from "./support.mjs";

const sentences = (count, prefix = "Sentence") =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}.`).join(" ");
const emit = (app, event) =>
  app.evaluate((_electron, e) => globalThis.conversationTest.emit(e), event);
const gap = (deck) =>
  deck.evaluate((n) => n.scrollHeight - n.scrollTop - n.clientHeight);

const history = (card) => card.locator(".gl-chat-history");

test("the history has no wide scrollbar, fades at the top, and still scrolls", async () => {
  const { app, card } = await launch();
  try {
    await emit(app, { type: "delta", id: "long", text: sentences(400) });
    const list = history(card);
    await expect
      .poll(() => list.evaluate((n) => n.scrollHeight > n.clientHeight))
      .toBe(true);
    const probe = await list.evaluate((n) => {
      const style = getComputedStyle(n);
      return {
        mask: style.maskImage || style.webkitMaskImage,
        bottomPad: parseFloat(style.paddingBottom),
      };
    });
    expect(probe.mask).not.toBe("none");
    expect(probe.bottomPad).toBeGreaterThanOrEqual(12);
    await list.hover();
    await expect.poll(() => gap(list)).toBeLessThanOrEqual(2);
    const before = await list.evaluate((n) => n.scrollTop);
    await card.mouse.wheel(0, -400);
    await expect
      .poll(() => list.evaluate((n) => n.scrollTop))
      .toBeLessThan(before - 100);
    await card.waitForTimeout(350);
    await shot(app, "visuals-history-fade");
    await card.screenshot({
      path: `${report}/visuals-history-fade-surface.png`,
    });
  } finally {
    await app.close();
  }
});

test("the history follows a stream, stays put once scrolled up, and resumes at the bottom", async () => {
  const { app, card } = await launch();
  try {
    const list = history(card);
    let count = 0;
    // Bursts: several deltas arrive before the next frame, so one scroll event
    // sees the content grown by far more than the "at bottom" tolerance.
    const stream = async (bursts, size = 4, pause = 30) => {
      for (let i = 0; i < bursts; i++) {
        const texts = Array.from(
          { length: size },
          () =>
            `Streamed ${++count}. A sentence long enough to wrap onto a second line. `,
        );
        await app.evaluate((_electron, texts) => {
          for (const text of texts)
            globalThis.conversationTest.emit({
              type: "delta",
              id: "follow",
              text,
            });
        }, texts);
        await card.waitForTimeout(pause);
      }
    };
    await stream(1, 2);
    await list.evaluate((n) => {
      window.behind = 0;
      const frame = () => {
        window.behind = Math.max(
          window.behind,
          n.scrollHeight - n.scrollTop - n.clientHeight,
        );
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await stream(16);
    await expect.poll(() => gap(list)).toBeLessThanOrEqual(2);
    expect(await card.evaluate(() => window.behind)).toBeLessThanOrEqual(400);
    await list.hover();
    await card.mouse.wheel(0, -500);
    await card.waitForTimeout(250);
    const parked = await list.evaluate((n) => n.scrollTop);
    expect(await gap(list)).toBeGreaterThan(40);
    await stream(4);
    await card.waitForTimeout(300);
    expect(
      Math.abs((await list.evaluate((n) => n.scrollTop)) - parked),
    ).toBeLessThanOrEqual(2);
    await card.mouse.wheel(0, 5000);
    await expect.poll(() => gap(list)).toBeLessThanOrEqual(2);
    await stream(3);
    await expect.poll(() => gap(list)).toBeLessThanOrEqual(2);
  } finally {
    await app.close();
  }
});

test("a capture status opens no notice, interrupts read 已停止, chips ellipsize, no gap without chips", async () => {
  const { app, card, errors } = await launch();
  try {
    const gapWithout = await card.evaluate(() => {
      const attachments = document.querySelector(".gl-attachments");
      return {
        display: getComputedStyle(attachments).display,
        height: attachments.getBoundingClientRect().height,
      };
    });
    expect(gapWithout.height).toBe(0);
    await emit(app, {
      type: "message",
      id: "stopped",
      role: "user",
      content: [{ type: "text", text: "[Request interrupted by user]" }],
    });
    await expect(card.locator(".gl-system-line")).toHaveText("已停止");
    await expect(card.getByText("Request interrupted")).toHaveCount(0);
    await app.evaluate(
      (_electron, image) => globalThis.conversationTest.capture(image),
      {
        ...capture,
        name: "非常長的檔案名稱-image-with-a-long-name-スクリーンショット.png",
      },
    );
    const chip = card.locator(".gl-attachment-name");
    await expect(chip).toBeVisible();
    const fit = await chip.evaluate((n) => {
      const style = getComputedStyle(n);
      return {
        ellipsis: style.textOverflow,
        clipped: n.scrollWidth > n.clientWidth,
        inside:
          n.getBoundingClientRect().right <=
          n.closest(".gl-chat-card").getBoundingClientRect().right,
      };
    });
    expect(fit).toEqual({ ellipsis: "ellipsis", clipped: true, inside: true });
    // A capture status no longer opens a notice in the card (N3.1).
    await emit(app, {
      type: "capture-status",
      state: "failed",
      message: "Could not capture the whole page.",
    });
    await card.waitForTimeout(150);
    await expect(card.locator(".gl-notice")).toBeHidden();
    await expect(card.getByText("Could not capture")).toHaveCount(0);
    expect(await bounds(card)).toEqual([]);
    await card.waitForTimeout(350);
    await shot(app, "visuals-notice-chip");
    await card.screenshot({
      path: `${report}/visuals-notice-chip-surface.png`,
    });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("the model picker opens inside the card without a blank entry", async () => {
  const { app, card } = await launch();
  try {
    await card.getByRole("button", { name: /^模型/ }).click();
    const list = card.getByRole("listbox", { name: "模型" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveText([
      "Opus",
      "Sonnet",
      "Haiku",
    ]);
    const inside = await card.evaluate(() => {
      const r = document
        .querySelector('[role="listbox"]:not([hidden])')
        .getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.top >= 0 &&
        r.right <= innerWidth &&
        r.bottom <= innerHeight
      );
    });
    expect(inside).toBe(true);
    await card.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await card.waitForTimeout(250);
    await card.getByRole("button", { name: /^模型/ }).click();
    await card.waitForTimeout(250);
    await shot(app, "visuals-picker");
  } finally {
    await app.close();
  }
});
