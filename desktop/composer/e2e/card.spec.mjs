import { test, expect } from "@playwright/test";
import { launch, capture, bounds, shot } from "./support.mjs";

const cardOpen = (card) =>
  card.evaluate(
    () => document.querySelector(".gl-chat-card")?.dataset.open === "true",
  );

test("Esc closes the open picker list only; a second Esc closes the card", async () => {
  const { app, card } = await launch();
  try {
    const model = card.locator(".gl-picker-trigger").first();
    await model.click();
    await expect(card.locator(".gl-picker-menu:not([hidden])")).toHaveCount(1);
    await card.keyboard.press("Escape");
    await expect(card.locator(".gl-picker-menu:not([hidden])")).toHaveCount(0);
    expect(await cardOpen(card)).toBe(true);
    await expect(model).toBeFocused();
    await card.keyboard.press("Escape");
    await expect.poll(() => cardOpen(card)).toBe(false);
  } finally {
    await app.close();
  }
});

test("Esc closes the list when the pointer opened it and focus stayed in the text box", async () => {
  const { app, card } = await launch();
  try {
    await card.locator(".gl-input").focus();
    await card.locator(".gl-picker-trigger").nth(1).click();
    await expect(card.locator(".gl-picker-menu:not([hidden])")).toHaveCount(1);
    await card.locator(".gl-input").focus();
    await card.keyboard.press("Escape");
    await expect(card.locator(".gl-picker-menu:not([hidden])")).toHaveCount(0);
    expect(await cardOpen(card)).toBe(true);
  } finally {
    await app.close();
  }
});

for (const scale of [1, 2])
  for (const width of [320, 420, 520]) {
    test(`six chips take at most two rows, never scroll, thumbnails 48px or taller, at ${scale * 100}% and ${width} DIP`, async () => {
      const { app, card } = await launch(scale);
      try {
        for (let n = 0; n < 6; n++)
          await app.evaluate(
            (_electron, image) => globalThis.conversationTest.capture(image),
            {
              ...capture,
              id: `chip-${n}`,
              name: `screenshot-number-${n}-with-a-long-name.png`,
            },
          );
        await app.evaluate(
          ({ screen }, { width }) => {
            const w = globalThis.conversationTest.windows[0];
            const area = screen.getDisplayMatching(w.getBounds()).workArea;
            w.setPosition(
              Math.floor(area.x + area.width - width - 20),
              w.getBounds().y,
            );
            w.setContentSize(width, w.getContentSize()[1]);
          },
          { width },
        );
        await expect.poll(() => card.evaluate(() => innerWidth)).toBe(width);
        await expect(card.locator(".gl-attachment-chip")).toHaveCount(6);
        await card.waitForTimeout(350);
        const m = await card.evaluate(() => {
          const strip = document.querySelector(".gl-attachments");
          const chips = [...strip.querySelectorAll(".gl-attachment-chip")];
          return {
            rows: new Set(
              chips.map((c) => Math.round(c.getBoundingClientRect().top)),
            ).size,
            scrolls: strip.scrollHeight > strip.clientHeight,
            overflowY: getComputedStyle(strip).overflowY,
            thumbs: chips.map(
              (c) => c.querySelector("img").getBoundingClientRect().height,
            ),
            fit: getComputedStyle(chips[0].querySelector("img")).objectFit,
            composerBelowCard:
              document.querySelector(".gl-composer").getBoundingClientRect()
                .bottom -
              document.querySelector(".gl-chat-card").getBoundingClientRect()
                .bottom,
          };
        });
        expect(m.rows).toBeLessThanOrEqual(2);
        expect(m.scrolls).toBe(false);
        expect(m.composerBelowCard).toBeLessThanOrEqual(0);
        expect(m.overflowY).toBe("visible");
        for (const h of m.thumbs) expect(h).toBeGreaterThanOrEqual(48);
        expect(await bounds(card)).toEqual([]);
        await shot(app, `chips-${scale * 100}-${width}`);
      } finally {
        await app.close();
      }
    });
  }

test("an English system shows English everywhere in the card", async () => {
  const { app, card } = await launch(1, { lang: "en-US" });
  try {
    await expect(card.getByPlaceholder("Ask Blink…")).toBeVisible();
    await app.evaluate(
      (_electron, image) => globalThis.conversationTest.capture(image),
      capture,
    );
    await expect(
      card.getByRole("button", { name: "What is this?", exact: true }),
    ).toBeVisible();
    await card.getByRole("button", { name: /^Thinking effort/ }).click();
    await expect(card.getByRole("option")).toHaveText([
      "Low",
      "Medium",
      "High",
      "Extra high",
      "Max",
    ]);
    await card.keyboard.press("Escape");
    const text = await card.evaluate(
      () => document.querySelector(".gl-chat-card").innerText,
    );
    expect(text).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/u);
    expect(await card.evaluate(() => document.documentElement.lang)).toBe("en");
  } finally {
    await app.close();
  }
});

test("the dot shows only while the connection is in trouble", async () => {
  const { app, card } = await launch();
  try {
    const dot = card.locator(".gl-status-dot");
    await expect(dot).toBeHidden();
    for (const [state, name] of [
      ["retrying", "正在重新連線到 Claude Code"],
      ["blocked", "等待 Claude Code"],
    ]) {
      await app.evaluate(
        (_e, state) =>
          globalThis.conversationTest.emit({ type: "status", state }),
        state,
      );
      await expect(dot).toBeVisible();
      await expect(dot).toHaveAttribute("aria-label", name);
    }
    await app.evaluate(() =>
      globalThis.conversationTest.emit({ type: "status", state: "connected" }),
    );
    await expect(dot).toBeHidden();
  } finally {
    await app.close();
  }
});
