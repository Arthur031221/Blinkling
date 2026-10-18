import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { launch } from "./support.mjs";
import { background, reveal, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";
import {
  FOLDER,
  LIVE,
  SAVE,
  cardPage,
  endTerminals,
  lines,
  pane,
  pinToTree,
  ready,
  startTerminal,
  tmux,
  type,
  waitFor,
} from "./live.mjs";

/** The live rows of checklist-324: real Claude Code terminals in tmux linked to
 * the real Blink. The terminal transcripts are saved next to the recordings. */
test.skip(!LIVE, "needs live claude terminals: set BLINKLING_LIVE=1");

const save = (name, text) => writeFile(join(SAVE, name), text);
/** Types a question and sends it. The card waits a moment after an answer for
 * a second word on it, so the box is not ready for the next question until
 * that moment is over. */
const ask = async (card, text) => {
  const users = () => card.locator(".gl-user").count();
  const before = await users();
  for (let i = 0; i < 8 && (await users()) === before; i++) {
    await card.locator("textarea").fill(text);
    await card.locator("textarea").press("Enter");
    await sleep(1200);
  }
  expect(await users(), "the question was sent").toBe(before + 1);
};
const openCard = async (app, page) => {
  await page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
  await expect.poll(() => !!cardPage(app), { timeout: 15000 }).toBe(true);
  return cardPage(app);
};
const answers = (card) => card.locator(".gl-assistant");
const text = async (card) => (await lines(card)).join("\n");

const NAMES = ["liveA", "liveB"];

test("two flagged sessions: the capture goes to the newest, the picked text reaches the terminal, the terminal stays quiet, and each question gets one answer", async () => {
  test.setTimeout(900000);
  const { runtime, restore } = await pinToTree();
  const { app, page } = await launch({
    env: { BLINKLING_RUNTIME_DIR: runtime },
  });
  const rec = record("terminal_quiet", {
    suffix: "-324",
    fps: 2,
    also: ["sync_meta", "capture_target", "picked_text_channel", "one_answer"],
  });
  try {
    await background(app);
    await reveal(page);
    for (const name of NAMES) {
      startTerminal(name, FOLDER, runtime);
      await ready(name);
      type(name, "/blinkling:blinkling");
      await waitFor(name, /Blink|desktop_open/i);
      await sleep(5000);
    }
    const card = await openCard(app, page);
    // sync_meta: the first lines of a new chat have no meta sentence.
    await expect
      .poll(
        () => card.locator('.gl-chat-tab[aria-selected="true"]').textContent(),
        {
          timeout: 20000,
        },
      )
      .toContain("alpha #2");
    const first = await text(card);
    await save("sync_meta-324-chat-B.txt", first);
    expect(first).not.toMatch(
      /Sync line|sync line|start command|同步行|啟動指令/,
    );
    rec.frame("new-chat-B");

    // capture_target: a menu capture goes to the session opened last (B).
    await app.evaluate(async ({ screen }) => {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ).toString("base64");
      await globalThis.blinklingTest.attachCapture({
        image: {
          id: "live-1",
          name: "Selection.png",
          mediaType: "image/png",
          data: png,
        },
        display: screen.getPrimaryDisplay(),
        region: { x: 300, y: 200, width: 360, height: 240 },
      });
    });
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1, {
      timeout: 10000,
    });
    expect(
      await card.locator('.gl-chat-tab[aria-selected="true"]').textContent(),
    ).toContain("alpha #2");
    rec.frame("capture-in-B");
    await card
      .locator(".gl-attachment-chip button")
      .first()
      .click()
      .catch(() => {});

    // picked_text_channel: a picked paragraph reaches the terminal as text.
    const PARAGRAPH =
      "MAGENTA-7731 The harbour clock stopped at nine past four.";
    await app.evaluate(async ({ screen }, paragraph) => {
      const display = screen.getPrimaryDisplay();
      await globalThis.blinklingTest.pick.deliver([
        {
          source: "pick",
          kind: "text",
          text: paragraph,
          display,
          bounds: {
            x: display.bounds.x + 200,
            y: display.bounds.y + 200,
            width: 400,
            height: 60,
          },
        },
      ]);
    }, PARAGRAPH);
    await expect(card.locator(".gl-attachment-chip").last()).toBeVisible({
      timeout: 10000,
    });
    await sleep(800);
    rec.frame("picked-text-chip");
    await card.locator(".gl-quick-chip", { hasText: "這是什麼" }).click();
    await waitFor("liveB", /MAGENTA-7731/, 120);
    await expect
      .poll(async () => await answers(card).count(), { timeout: 120000 })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => await answers(card).last().textContent(), {
        timeout: 120000,
      })
      .toContain("MAGENTA-7731");
    await save("picked_text_channel-324-terminal-B.txt", pane("liveB"));
    rec.frame("picked-text-answer");
    expect(pane("liveA")).not.toMatch(/MAGENTA-7731/);

    // terminal_quiet and one_answer: three questions, one answer each, and the
    // terminal says nothing after the reply call.
    const before = await answers(card).count();
    const questions = [
      "Reply with the single word LEMON and nothing else.",
      "Run the shell command `echo interim-line` first, then reply with the single word LIME.",
      "Reply with the single word PLUM and nothing else.",
    ];
    for (const [i, q] of questions.entries()) {
      await ask(card, q);
      const word = ["LEMON", "LIME", "PLUM"][i];
      await expect
        .poll(async () => await answers(card).last().textContent(), {
          timeout: 150000,
        })
        .toContain(word);
      // Let a possible second reply or terminal answer land.
      await sleep(6000);
      expect(
        await answers(card).count(),
        `one answer for question ${i + 1}`,
      ).toBe(before + i + 1);
      rec.frame(`question-${i + 1}`);
      // Approve a tool call the terminal asked about, if it is still asking.
      if (/Do you want to|1\. Yes/i.test(pane("liveB")))
        tmux("send-keys", "-t", "liveB", "Enter");
    }
    const transcript = pane("liveB");
    await save("terminal_quiet-324-terminal-B.txt", transcript);
    expect(transcript).not.toMatch(
      /Answered in Blink|I sent .* to Blink|Sent to Blink/i,
    );
    rec.frame("transcript-quiet");
    await save("one_answer-324-card.txt", await text(card));
  } catch (error) {
    await save("live324-debug-B.txt", pane("liveB")).catch(() => {});
    await save(
      "live324-debug-card.txt",
      await text(cardPage(app)).catch(() => ""),
    ).catch(() => {});
    throw error;
  } finally {
    endTerminals(NAMES);
    await rec.stop();
    await app.close().catch(() => {});
    await restore();
  }
});
