import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { png } from "./image.mjs";
import { report, capture, launch, shot, bounds } from "./support.mjs";

test("capture, three quick asks, image payload, streamed formatting, stop, Enter and Shift+Enter", async () => {
  const { app, card, errors } = await launch();
  try {
    await app.evaluate(
      (_electron, image) => globalThis.conversationTest.capture(image),
      capture,
    );
    await expect(
      card.getByRole("button", { name: "這是什麼", exact: true }),
    ).toBeVisible();
    await expect(card.locator(".gl-quick-chip")).toHaveCount(3);
    await card.getByRole("button", { name: "這是什麼", exact: true }).click();
    await expect(
      card.locator(".gl-chat-message.gl-assistant strong"),
    ).toContainText(["Blinkling", "重點"]);
    await expect(card.getByRole("button", { name: "停止回答" })).toBeHidden();
    const turns = await app.evaluate(() => globalThis.conversationTest.turns);
    expect(turns).toHaveLength(1);
    expect(turns[0].source).toBe("quick-ask");
    expect(turns[0].content[0].source.data).toBe(png);
    await card.getByRole("button", { name: "複製程式碼" }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("const result = 'Blink';");
    const text = card.getByRole("textbox", { name: "輸入問題" });
    await text.fill("第一行");
    await text.press("Shift+Enter");
    await text.type("第二行");
    expect(await text.inputValue()).toBe("第一行\n第二行");
    await text.press("Enter");
    await expect(card.getByRole("button", { name: "停止回答" })).toBeVisible();
    await card.getByRole("button", { name: "停止回答" }).click();
    await expect(card.getByRole("button", { name: "停止回答" })).toBeHidden();
    expect(
      (await app.evaluate(() => globalThis.conversationTest.turns)).at(-1).text,
    ).toBe("第一行\n第二行");
    expect(
      (await app.evaluate(() => globalThis.conversationTest.activities)).some(
        (a) => a.speaking,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await shot(app, "capture-and-chat");
  } finally {
    await app.close();
  }
});

test("plus, paste, drop, remove, text files and acknowledged picker rejection", async () => {
  const { app, card } = await launch();
  try {
    const chooser = card.waitForEvent("filechooser");
    await card.getByRole("button", { name: "加入附件" }).click();
    await (
      await chooser
    ).setFiles([
      {
        name: "long-file-日本語.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      },
      {
        name: "notes.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Note\nHello"),
      },
    ]);
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(2);
    await card.getByRole("button", { name: "移除 notes.md" }).click();
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    for (const type of ["paste", "drop"]) {
      await card.evaluate(
        ({ type, png }) => {
          const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bytes], `${type}.png`, { type: "image/png" }));
          document.querySelector(".gl-chat-card").dispatchEvent(
            type === "paste"
              ? new ClipboardEvent("paste", {
                  clipboardData: dt,
                  bubbles: true,
                  cancelable: true,
                })
              : new DragEvent("drop", {
                  dataTransfer: dt,
                  bubbles: true,
                  cancelable: true,
                }),
          );
        },
        { type, png },
      );
    }
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(3);
    const modelPicker = card.getByRole("button", { name: /^模型/ });
    const effortPicker = card.getByRole("button", { name: /^思考程度/ });
    await modelPicker.click();
    const options = card.getByRole("listbox", { name: "模型" });
    // No blank entry and no duplicate rows.
    await expect(options.getByRole("option")).toHaveText([
      "Opus",
      "Sonnet",
      "Haiku",
    ]);
    await options.getByRole("option", { name: "Sonnet" }).click();
    // The selection is only shown once Claude confirms it.
    await expect(modelPicker).toHaveAttribute("aria-label", "模型：Haiku");
    await expect(modelPicker).toHaveAttribute("aria-label", "模型：Sonnet 5.5");
    await effortPicker.click();
    await card
      .getByRole("listbox", { name: "思考程度" })
      .getByRole("option", { name: "High" })
      .click();
    await expect(effortPicker).toHaveAttribute("aria-label", "思考程度：High");
    await modelPicker.click();
    await options.getByRole("option", { name: "Opus" }).click();
    await expect(card.getByRole("alert")).toBeVisible();
    await expect(modelPicker).toHaveAttribute("aria-label", "模型：Sonnet 5.5");
    await expect(effortPicker).toHaveAttribute("aria-label", "思考程度：High");
    expect(await bounds(card)).toEqual([]);
  } finally {
    await app.close();
  }
});

test("captured window text has its own chip and removal excludes it from the sent turn", async () => {
  const { app, card, errors } = await launch();
  const text = {
    id: "captured-window-text",
    name: "視窗文字.txt",
    mediaType: "text/plain",
    data: Buffer.from("Visible text from the captured window").toString(
      "base64",
    ),
  };
  try {
    await app.evaluate(
      (_electron, value) => globalThis.conversationTest.capture(value),
      { image: capture, text },
    );
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(2);
    await expect(
      card.getByRole("button", { name: "移除 視窗文字.txt" }),
    ).toBeVisible();
    expect(await bounds(card)).toEqual([]);
    await shot(app, "capture-window-text");
    await card.screenshot({
      path: `${report}/capture-window-text-surface.png`,
    });
    await card.getByRole("button", { name: "這是什麼", exact: true }).click();
    await expect(card.getByRole("button", { name: "停止回答" })).toBeHidden();
    const first = await app.evaluate(
      () => globalThis.conversationTest.turns[0],
    );
    expect(first.content.map((b) => b.type)).toEqual(["image", "document"]);
    expect(first.content[1].source.data).toBe(
      "Visible text from the captured window",
    );
    await expect(card.locator(".gl-user .gl-document")).toHaveText(
      "📎 視窗文字.txt",
    );
    await app.evaluate(
      (_electron, value) => globalThis.conversationTest.capture(value),
      { image: capture, text },
    );
    await card.getByRole("button", { name: "移除 視窗文字.txt" }).click();
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    await card.getByRole("button", { name: "翻譯", exact: true }).click();
    await expect(card.getByRole("button", { name: "停止回答" })).toBeHidden();
    const second = await app.evaluate(
      () => globalThis.conversationTest.turns[1],
    );
    expect(second.content.map((b) => b.type)).toEqual(["image"]);
    expect(second.attachments.map((a) => a.id)).toEqual([capture.id]);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("bubbles stream upward, fade by height, retain wheel history, revive after quiet and open full chat", async () => {
  const { app, card } = await launch();
  try {
    await app.evaluate(() => globalThis.conversationTest.bubbles());
    const bubble = (await app.windows())[1];
    const answer =
      "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. Sixth sentence. Seventh sentence. Eighth sentence.\n\n- **Point**: Keep structure\n\n```js\nconsole.log('Blink');\n```";
    await app.evaluate((_electron, text) => {
      const t = globalThis.conversationTest;
      t.emit({ type: "delta", id: "older", text: "Earlier answer. " });
      t.emit({ type: "done", turnId: "previous" });
      t.emit({ type: "delta", id: "current", text });
      t.hover(true);
    }, answer);
    await expect(bubble.locator(".gl-answer-bubble")).toHaveCount(12);
    await expect(
      bubble.getByRole("button", { name: "在對話中開啟" }),
    ).toBeVisible();
    // Older bubbles fade by opacity alone, in order of their distance (BD-3).
    await expect
      .poll(() =>
        bubble.locator(".gl-answer-bubble").evaluateAll((nodes) => {
          const opacity = nodes.map((n) => Number(getComputedStyle(n).opacity));
          return (
            opacity.at(-1) === 1 &&
            opacity[0] < 1 &&
            opacity.every((o, i) => i === 0 || o >= opacity[i - 1])
          );
        }),
      )
      .toBe(true);
    await bubble.locator(".gl-bubble-deck").hover();
    await bubble.mouse.wheel(0, -1800);
    await expect(
      bubble.getByText("Earlier answer.", { exact: true }),
    ).toBeVisible();
    await app.evaluate(() => {
      const t = globalThis.conversationTest;
      t.emit({ type: "done", turnId: "current" });
      t.hover(false);
    });
    await bubble.mouse.move(2, 2);
    await expect(bubble.locator(".gl-bubble-deck")).toHaveAttribute(
      "data-visible",
      "false",
    );
    await app.evaluate(() => globalThis.conversationTest.hover(true));
    await expect(bubble.locator(".gl-bubble-deck")).toHaveAttribute(
      "data-visible",
      "true",
    );
    await expect(bubble.locator(".gl-bubble-deck")).toHaveCSS("opacity", "1");
    await bubble.locator(".gl-bubble-deck").hover();
    await app.evaluate(() => globalThis.conversationTest.hover(false));
    await bubble.waitForTimeout(950);
    await expect(bubble.locator(".gl-bubble-deck")).toHaveAttribute(
      "data-visible",
      "true",
    );
    await bubble.waitForTimeout(300);
    await shot(app, "bubble-history");
    await bubble.screenshot({ path: `${report}/bubble-history-surface.png` });
    await bubble
      .locator(".gl-bubble-deck")
      .evaluate((n) => (n.scrollTop = n.scrollHeight));
    await bubble.getByRole("button", { name: "在對話中開啟" }).click();
    await expect(card.getByRole("textbox", { name: "輸入問題" })).toBeVisible();
  } finally {
    await app.close();
  }
});

test("a full-page capture shows progress at once and its notice is replaced on success, truncation and failure", async () => {
  const { app } = await launch();
  try {
    await app.evaluate(() => globalThis.conversationTest.bubbles());
    const bubble = (await app.windows())[1];
    const notice = bubble.locator(".gl-notice");
    const status = (event) =>
      app.evaluate(
        (_electron, e) =>
          globalThis.conversationTest.emit({ type: "capture-status", ...e }),
        event,
      );
    await status({
      state: "capturing",
      kind: "full-page",
      message: "整頁截圖中…",
    });
    await expect(notice).toHaveText("整頁截圖中…");
    await status({
      state: "capturing",
      kind: "full-page",
      message: "整頁截圖中… 3/12",
      completed: 3,
      total: 12,
    });
    await expect(notice).toHaveText("整頁截圖中… 3/12");
    await bubble.waitForTimeout(300);
    await shot(app, "full-page-progress");
    await status({ state: "done", kind: "full-page" });
    await expect(notice).toBeHidden();

    await status({
      state: "capturing",
      kind: "full-page",
      message: "整頁截圖中… 1/12",
    });
    await expect(notice).toBeVisible();
    await status({
      state: "done",
      kind: "full-page",
      message: "頁面很長，只截取了前面的部分。",
    });
    await expect(notice).toHaveText("頁面很長，只截取了前面的部分。");

    await status({
      state: "capturing",
      kind: "full-page",
      message: "整頁截圖中…",
    });
    await status({
      state: "failed",
      kind: "full-page",
      message: "整頁截圖暫時無法完成，請再試一次。",
    });
    await expect(notice).toHaveText("整頁截圖暫時無法完成，請再試一次。");
    await bubble.waitForTimeout(300);
    await shot(app, "full-page-failed");
    await status({ state: "done", kind: "full-page" });
    await expect(notice).toBeHidden();
  } finally {
    await app.close();
  }
});

for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"]) {
    test(`card, bubble bounds and streamed motion at ${scale * 100}% ${theme}, 320/420/520 DIP`, async () => {
      const { app, card, errors } = await launch(scale);
      try {
        await card.emulateMedia({ colorScheme: theme });
        await card.getByRole("button", { name: "釘選對話" }).click();
        await app.evaluate(
          (_electron, image) => globalThis.conversationTest.capture(image),
          {
            ...capture,
            name: "非常長的檔案名稱-image-with-a-long-name-スクリーンショット.png",
          },
        );
        await app.evaluate(() =>
          globalThis.conversationTest.emit({
            type: "message",
            id: "formatted",
            role: "assistant",
            content: [
              {
                type: "text",
                text: "簡短答案：**每個重點都有自己的位置**。\n\n- **畫面**：先看摘要，再選擇要問的部分。\n- **對話**：保留上下文，繼續追問。\n\n```ts\nconst screen = 'a-very-long-unbroken-line-with-no-layout-overflow'.repeat(8);\n```\n\n| 項目 | 說明 |\n| --- | --- |\n| 字體 | 清楚易讀 |",
              },
            ],
          }),
        );
        expect(await card.evaluate(() => devicePixelRatio)).toBe(scale);
        for (const width of [320, 420, 520]) {
          await app.evaluate(
            ({ screen }, { width }) => {
              const w = globalThis.conversationTest.windows[0];
              const area = screen.getDisplayMatching(w.getBounds()).workArea;
              // A 1280px desktop is 853⅓ DIP at 150%. Move to an integral
              // position separately so native rounding cannot resize the client.
              w.setPosition(
                Math.floor(area.x + area.width - width - 20),
                w.getBounds().y,
              );
              w.setContentSize(width, w.getContentSize()[1]);
            },
            { width },
          );
          await expect.poll(() => card.evaluate(() => innerWidth)).toBe(width);
          expect(
            await app.evaluate(({ screen }) => {
              const b = globalThis.conversationTest.windows[0].getBounds();
              const a = screen.getDisplayMatching(b).workArea;
              return (
                b.x >= a.x &&
                b.y >= a.y &&
                b.x + b.width <= a.x + a.width &&
                b.y + b.height <= a.y + a.height
              );
            }),
          ).toBe(true);
          await card
            .locator(".gl-chat-history")
            .evaluate((n) => (n.scrollTop = n.scrollHeight));
          // Wait for the real compositor/animation to settle before measuring.
          await card.waitForTimeout(350);
          expect(await bounds(card)).toEqual([]);
          await shot(app, `card-${scale * 100}-${theme}-${width}`);
          await card.screenshot({
            path: `${report}/card-${scale * 100}-${theme}-${width}-surface.png`,
          });
        }
        await app.evaluate(() => {
          const t = globalThis.conversationTest;
          let count = 0;
          const timer = setInterval(() => {
            t.emit({
              type: "delta",
              id: "motion",
              text: `Sentence ${++count}. `,
            });
            if (count === 25) {
              clearInterval(timer);
              t.emit({ type: "done", turnId: "motion" });
            }
          }, 40);
        });
        const timings = await card.evaluate(async () => {
          const times = [];
          let last;
          await new Promise((resolve) => {
            const start = performance.now();
            function frame(t) {
              if (last !== undefined) times.push(t - last);
              last = t;
              if (t - start < 1000) requestAnimationFrame(frame);
              else resolve();
            }
            requestAnimationFrame(frame);
          });
          return times;
        });
        await writeFile(
          `${report}/frames-${scale * 100}-${theme}.json`,
          JSON.stringify(
            {
              scale,
              theme,
              samples: timings,
              median: [...timings].sort((a, b) => a - b)[
                Math.floor(timings.length / 2)
              ],
            },
            null,
            2,
          ),
        );
        expect(timings.length).toBeGreaterThan(40);
        expect(timings.filter((t) => t > 50).length).toBeLessThan(4);
        await expect(
          card.getByRole("button", { name: "停止回答" }),
        ).toBeHidden();
        await app.evaluate(() => {
          const t = globalThis.conversationTest;
          t.bubbles();
          t.hover(true);
          t.emit({
            type: "delta",
            id: "bubble-motion",
            text: "Starting here. ",
          });
        });
        const bubble = (await app.windows())[1];
        expect(
          await app.evaluate(
            () =>
              globalThis.conversationTest.windows[1].webContents
                .backgroundThrottling,
          ),
        ).toBe(false);
        expect(await bubble.evaluate(() => document.visibilityState)).toBe(
          "visible",
        );
        await bubble.emulateMedia({ colorScheme: theme });
        const first = bubble.locator('[data-id="bubble-motion:0"]');
        await expect(first).toBeVisible();
        await bubble.waitForTimeout(350);
        const before = await first.boundingBox();
        await app.evaluate(() =>
          globalThis.conversationTest.emit({
            type: "delta",
            id: "bubble-motion",
            text: "Moving upward. ",
          }),
        );
        await expect(
          bubble.locator('[data-id="bubble-motion:1"]'),
        ).toBeVisible();
        await bubble.waitForTimeout(350);
        expect((await first.boundingBox()).y).toBeLessThan(before.y - 20);
        await app.evaluate(() => {
          const t = globalThis.conversationTest;
          let count = 0;
          const timer = setInterval(() => {
            t.emit({
              type: "delta",
              id: "bubble-motion",
              text: `Short point ${++count}. `,
            });
            if (count === 12) {
              clearInterval(timer);
              t.emit({ type: "done", turnId: "bubble-motion" });
            }
          }, 80);
        });
        const frames = await bubble.evaluate(async () => {
          const times = [];
          let previous;
          await new Promise((resolve) => {
            const start = performance.now();
            function frame(t) {
              if (previous !== undefined) times.push(t - previous);
              previous = t;
              if (t - start < 1000) requestAnimationFrame(frame);
              else resolve();
            }
            requestAnimationFrame(frame);
          });
          return times;
        });
        expect(frames.length).toBeGreaterThan(40);
        expect(frames.filter((t) => t > 50).length).toBeLessThan(4);
        await writeFile(
          `${report}/bubble-frames-${scale * 100}-${theme}.json`,
          JSON.stringify({ scale, theme, samples: frames }, null, 2),
        );
        await expect(
          bubble
            .locator(".gl-answer-bubble")
            .last()
            .getByRole("button", { name: "在對話中開啟" }),
        ).toBeVisible();
        await bubble.waitForTimeout(350);
        await shot(app, `bubbles-${scale * 100}-${theme}`);
        await bubble.screenshot({
          path: `${report}/bubbles-${scale * 100}-${theme}-surface.png`,
        });
        expect(errors).toEqual([]);
      } finally {
        await app.close();
      }
    });
  }
