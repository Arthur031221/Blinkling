import { test, expect } from "@playwright/test";
import { report, capture, launch, shot, bounds } from "./support.mjs";

const sentences = (count, prefix = "Sentence") =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}.`).join(" ");
const emit = (app, event) =>
  app.evaluate((_electron, e) => globalThis.conversationTest.emit(e), event);
const gap = (deck) =>
  deck.evaluate((n) => n.scrollHeight - n.scrollTop - n.clientHeight);

async function showBubbles(app) {
  await app.evaluate(() => globalThis.conversationTest.bubbles());
  return (await app.windows())[1];
}
async function reveal(app, bubble) {
  await app.evaluate(() => globalThis.conversationTest.hover(true));
  await expect(bubble.locator(".gl-bubble-deck")).toHaveAttribute(
    "data-visible",
    "true",
  );
}

test("older bubbles fade by opacity alone; the deck has no native scrollbar and still scrolls", async () => {
  const { app } = await launch();
  try {
    const bubble = await showBubbles(app);
    await emit(app, { type: "delta", id: "long", text: sentences(24) });
    const nodes = bubble.locator(".gl-answer-bubble");
    await expect.poll(() => nodes.count()).toBeGreaterThanOrEqual(24);
    await reveal(app, bubble);
    const deck = bubble.locator(".gl-bubble-deck");
    const probe = await deck.evaluate((n) => {
      const bubbles = [...n.querySelectorAll(".gl-answer-bubble")];
      const style = getComputedStyle(n);
      return {
        scrollbarWidth: style.scrollbarWidth,
        gutter: n.offsetWidth - n.clientWidth,
        mask: style.maskImage || style.webkitMaskImage,
        overflows: n.scrollHeight > n.clientHeight,
      };
    });
    // Entry animations may still be running; at rest only the bubbles fade,
    // by distance from the newest, and what is inside a bubble stays solid.
    await expect
      .poll(() =>
        deck.evaluate((n) => {
          const opacity = [...n.querySelectorAll(".gl-answer-bubble")].map(
            (x) => Number(getComputedStyle(x).opacity),
          );
          const inner = [...n.querySelectorAll(".gl-answer-bubble *")].some(
            (x) => getComputedStyle(x).opacity !== "1",
          );
          return (
            !inner &&
            opacity.at(-1) === 1 &&
            opacity.some((o) => o < 1) &&
            opacity.every((o, i) => i === 0 || o >= opacity[i - 1])
          );
        }),
      )
      .toBe(true);
    expect(probe.scrollbarWidth).toBe("none");
    expect(probe.gutter).toBe(0);
    expect(probe.mask).not.toBe("none");
    expect(probe.overflows).toBe(true);
    await deck.hover();
    const before = await deck.evaluate((n) => n.scrollTop);
    await bubble.mouse.wheel(0, -400);
    await expect
      .poll(() => deck.evaluate((n) => n.scrollTop))
      .toBeLessThan(before - 100);
    await bubble.waitForTimeout(350);
    await shot(app, "visuals-opaque-deck");
    await bubble.screenshot({
      path: `${report}/visuals-opaque-deck-surface.png`,
    });
  } finally {
    await app.close();
  }
});

test("the deck follows a stream, stays put once scrolled up, and resumes at the bottom", async () => {
  const { app } = await launch();
  try {
    const bubble = await showBubbles(app);
    const deck = bubble.locator(".gl-bubble-deck");
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
        await bubble.waitForTimeout(pause);
      }
    };
    await stream(1, 2);
    await reveal(app, bubble);
    // Track how far behind the newest content the deck falls while streaming.
    await deck.evaluate((n) => {
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
    await expect.poll(() => gap(deck)).toBeLessThanOrEqual(2);
    // A burst adds ~4 bubbles; falling further behind means it stopped following.
    expect(await bubble.evaluate(() => window.behind)).toBeLessThanOrEqual(400);
    await deck.hover();
    await bubble.mouse.wheel(0, -500);
    await bubble.waitForTimeout(250);
    const parked = await deck.evaluate((n) => n.scrollTop);
    expect(await gap(deck)).toBeGreaterThan(40);
    await stream(4);
    await bubble.waitForTimeout(300);
    expect(
      Math.abs((await deck.evaluate((n) => n.scrollTop)) - parked),
    ).toBeLessThanOrEqual(2);
    await bubble.mouse.wheel(0, 5000);
    await expect.poll(() => gap(deck)).toBeLessThanOrEqual(2);
    await stream(3);
    await expect.poll(() => gap(deck)).toBeLessThanOrEqual(2);
  } finally {
    await app.close();
  }
});

test("long answers are capped and open the chat; 簡答 explains itself", async () => {
  const { app, card } = await launch();
  try {
    const bubble = await showBubbles(app);
    const code = Array.from({ length: 60 }, (_, i) => `line_${i}();`).join(
      "\n",
    );
    await emit(app, {
      type: "message",
      id: "capped",
      role: "assistant",
      content: [
        {
          type: "text",
          text: `**簡答**：先看重點。\n\n\`\`\`js\n${code}\n\`\`\``,
        },
      ],
    });
    await reveal(app, bubble);
    const long = bubble.locator('.gl-answer-bubble[data-clipped="true"]');
    await expect(long).toHaveCount(1);
    const box = await long.boundingBox();
    const screen = await bubble.evaluate(() => innerHeight);
    expect(box.height).toBeLessThanOrEqual(200);
    expect(box.height).toBeLessThan(screen / 2);
    await expect(long).toHaveAttribute("aria-label", "開啟完整內容");
    // No nested native scrollbar inside the capped bubble.
    expect(
      await long.evaluate(
        (n) =>
          [...n.querySelectorAll("*")].filter(
            (x) =>
              ["auto", "scroll"].includes(getComputedStyle(x).overflowY) &&
              x.scrollHeight > x.clientHeight,
          ).length,
      ),
    ).toBe(0);
    const tag = bubble.locator(".gl-summary-tag");
    await expect(tag).toHaveText("簡答");
    await expect(tag).toHaveAttribute("title", /完整內容/);
    await bubble.waitForTimeout(350);
    await shot(app, "visuals-long-answer");
    await long.click({ position: { x: 20, y: 20 } });
    await expect(card.getByRole("textbox", { name: "輸入問題" })).toBeVisible();
  } finally {
    await app.close();
  }
});

test("the notice sits above the toolbar, interrupts read 已停止, chips ellipsize, no gap without chips", async () => {
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
    await app.evaluate(() =>
      globalThis.conversationTest.windows[0].webContents.send("test:surface", {
        type: "view",
        view: "help",
      }),
    );
    const notice = card.locator(".gl-notice");
    await expect(notice).toBeVisible();
    const rects = await card.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const n = r(".gl-notice"),
        t = r(".gl-composer-toolbar"),
        f = r(".gl-composer");
      return { notice: n.toJSON(), toolbar: t.toJSON(), form: f.toJSON() };
    });
    expect(rects.notice.bottom).toBeLessThanOrEqual(rects.form.top + 0.5);
    expect(rects.notice.bottom).toBeLessThanOrEqual(rects.toolbar.top);
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
