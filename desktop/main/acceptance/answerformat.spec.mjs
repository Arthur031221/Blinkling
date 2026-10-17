import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const emit = (app, event) =>
  app.evaluate(
    (_e, event) => globalThis.blinklingTest.session.emit(event),
    event,
  );
const say = (app, id, role, text) =>
  emit(app, {
    type: "message",
    id,
    role,
    content: [{ type: "text", text }],
  });

const ANSWER = [
  "# What the page does",
  "",
  "A **bold** word, an *italic* one, and `inline_code()` in a sentence.",
  "",
  "## Steps",
  "",
  "1. Open the file",
  "2. Read the header",
  "   - first nested point",
  "   - second nested point",
  "3. Run it",
  "",
  "> A quoted line from the page.",
  "",
  "| Name | Count |",
  "| :--- | ---: |",
  "| apples | 12 |",
  "| pears | 7 |",
  "",
  "```js",
  "// add two numbers",
  "function add(a, b) {",
  '  return a + b + 1; // "one"',
  "}",
  "```",
].join("\n");

test("an answer is drawn like a chat answer: headings, lists, quote, table, inline and highlighted code", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("answer_format", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(900);
    await say(app, "u1", "user", "What does this page do?");
    await say(app, "a1", "assistant", ANSWER);
    const card = cardPage(app);
    await expect(card.locator(".gl-assistant h1")).toHaveCount(1);
    await card.evaluate(() => {
      const list =
        document
          .querySelector(".gl-assistant")
          .closest(".gl-chat-list, [class*='scroll']") ??
        document.scrollingElement;
      document
        .querySelector(".gl-assistant h1")
        .scrollIntoView({ block: "start" });
      return list;
    });
    await page.waitForTimeout(700);
    rec.frame("top");
    await card.evaluate(() =>
      document
        .querySelector(".gl-assistant ol")
        .scrollIntoView({ block: "start" }),
    );
    await page.waitForTimeout(700);
    rec.frame("lists");
    const shape = await card.evaluate(() => {
      const q = (s) => document.querySelectorAll(`.gl-assistant ${s}`).length;
      const mono = (el) => getComputedStyle(el).fontFamily;
      const code = document.querySelector(".gl-assistant pre code");
      const colors = new Set(
        [...code.querySelectorAll("span")].map(
          (s) => getComputedStyle(s).color,
        ),
      );
      return {
        h1: q("h1"),
        h2: q("h2"),
        ol: q("ol"),
        nested: q("ul ul") + q("ol ul"),
        strong: q("strong"),
        em: q("em"),
        quote: q("blockquote"),
        rows: q("table tr"),
        right: getComputedStyle(
          document.querySelector(".gl-assistant td:last-child"),
        ).textAlign,
        inline: mono(document.querySelector(".gl-assistant p code")),
        block: mono(code),
        lang: code.closest("[data-lang]")?.dataset.lang,
        colors: colors.size,
        tokens: [...code.querySelectorAll("span")].length,
      };
    });
    expect(shape.h1).toBe(1);
    expect(shape.h2).toBe(1);
    expect(shape.ol).toBe(1);
    expect(shape.nested).toBe(1);
    expect(shape.strong).toBe(1);
    expect(shape.em).toBe(1);
    expect(shape.quote).toBe(1);
    expect(shape.rows).toBe(3);
    expect(shape.right).toBe("right");
    expect(shape.inline).toMatch(/mono/i);
    expect(shape.block).toMatch(/mono/i);
    expect(shape.lang).toBe("js");
    expect(
      shape.colors,
      "code is highlighted in several colours",
    ).toBeGreaterThan(2);
    await card.evaluate(() =>
      document.querySelector(".gl-assistant table").scrollIntoView(),
    );
    await page.waitForTimeout(600);
    rec.frame("table");
    await card.evaluate(() =>
      document.querySelector(".gl-assistant pre").scrollIntoView(),
    );
    await page.waitForTimeout(800);
    rec.frame("code");
  } finally {
    await rec.stop();
    await app.close();
  }
});
