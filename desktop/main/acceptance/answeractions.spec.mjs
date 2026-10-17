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
const say = (app, id, role, text, at) =>
  emit(app, {
    type: "message",
    id,
    role,
    at,
    content: [{ type: "text", text }],
  });
const clipboard = (app) =>
  app.evaluate(({ clipboard }) => clipboard.readText());
const clearClipboard = (app) =>
  app.evaluate(({ clipboard }) => clipboard.writeText(""));

const ANSWER = [
  "The function adds two numbers.",
  "",
  "```js",
  "function add(a, b) {",
  "  return a + b;",
  "}",
  "```",
].join("\n");

test("under every answer and message: copy, ask again, read aloud, time, delivered, edit", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("answer_actions", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(900);
    const hours = (n) => Date.now() - n * 3600_000;
    await say(app, "u1", "user", "What does add do?", hours(6));
    await say(app, "a1", "assistant", ANSWER, hours(6));
    const card = cardPage(app);
    await expect(card.locator(".gl-assistant .gl-message-meta")).toHaveCount(1);
    await page.waitForTimeout(700);
    rec.frame("rows");
    // The row under the answer: copy, ask again, read aloud, and the time.
    const answerRow = card.locator(".gl-assistant .gl-message-meta");
    await expect(answerRow.locator("button")).toHaveCount(3);
    await expect(answerRow.locator(".gl-meta-time")).toHaveText(/6/);
    const userRow = card.locator(".gl-user .gl-message-meta");
    await expect(userRow.locator(".gl-meta-tick")).toHaveCount(1);
    await expect(userRow.locator(".gl-meta-time")).toHaveText(/6/);
    // Copy the whole answer: the system clipboard holds its Markdown.
    await clearClipboard(app);
    await answerRow.locator('[data-act="copy"]').click();
    await expect.poll(() => clipboard(app)).toBe(ANSWER);
    rec.frame("copied-answer");
    // The copy button on the code block works too.
    await clearClipboard(app);
    await card.locator(".gl-code-toolbar button").click();
    await expect
      .poll(() => clipboard(app))
      .toBe("function add(a, b) {\n  return a + b;\n}");
    await page.waitForTimeout(300);
    rec.frame("copied-code");
    // My message: copy.
    await clearClipboard(app);
    await userRow.locator('[data-act="copy"]').click();
    await expect.poll(() => clipboard(app)).toBe("What does add do?");
    // Read aloud: this machine has no voice, and says so; with a voice the
    // button turns into "stop" and back.
    await answerRow.locator('[data-act="read"]').click();
    await expect(answerRow.locator('[data-act="read"]')).toHaveText(
      /語音|voice/i,
    );
    rec.frame("no-voice");
    await card.evaluate(() => {
      const spoken = [];
      let current;
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          getVoices: () => [{ lang: "zh-TW", name: "Test" }],
          speak: (u) => {
            spoken.push(u.text);
            current = u;
          },
          cancel: () => {},
          addEventListener: () => {},
        },
      });
      window.__spoken = spoken;
      window.__finish = () => current?.onend?.();
    });
    await page.waitForTimeout(2000);
    await answerRow.locator('[data-act="read"]').click();
    await expect(answerRow.locator('[data-act="read"]')).toHaveAttribute(
      "data-reading",
      "true",
    );
    expect(await card.evaluate(() => window.__spoken[0])).toBe(
      "The function adds two numbers.",
    );
    rec.frame("reading");
    await card.evaluate(() => window.__finish());
    await expect(answerRow.locator('[data-act="read"]')).toHaveAttribute(
      "data-reading",
      "false",
    );
    // Edit puts my words back in the box; the chat keeps them.
    await userRow.locator('[data-act="edit"]').click();
    await expect(card.locator("textarea")).toHaveValue("What does add do?");
    await expect(card.locator(".gl-user")).toHaveCount(1);
    rec.frame("edit");
    // Ask again sends the question once more as a new turn.
    await card.locator("textarea").fill("");
    await answerRow.locator('[data-act="retry"]').click();
    await expect(card.locator(".gl-user")).toHaveCount(2, { timeout: 8000 });
    await expect(card.locator("textarea")).toHaveValue("");
    rec.frame("asked-again");
    await page.waitForTimeout(500);
  } finally {
    await rec.stop();
    await app.close();
  }
});
