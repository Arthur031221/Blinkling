import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { launch } from "./support.mjs";
import { background, reveal, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";
import { EXPLAIN_PROMPT } from "../../autowatch/index.mjs";
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

/** More live rows of checklist-324: a busy terminal, Auto explain next to two
 * linked sessions, and the closing notice. */
test.skip(!LIVE, "needs live claude terminals: set BLINKLING_LIVE=1");

const save = (name, text) => writeFile(join(SAVE, name), text);
const NAMES = ["liveU", "liveA"];
const said = (card) =>
  card
    .locator(".gl-assistant")
    .evaluateAll((els) => els.map((el) => el.textContent).join("\n"));
const text = async (card) => (await lines(card)).join("\n");
const openCard = async (app, page) => {
  await page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
  await expect.poll(() => !!cardPage(app), { timeout: 15000 }).toBe(true);
  return cardPage(app);
};
/** Types into a terminal and presses Enter again if the line is still sitting
 * in the input box a moment later. */
const send = async (name, line) => {
  type(name, line);
  for (let i = 0; i < 5; i++) {
    await sleep(2000);
    const inputs = pane(name)
      .split("\n")
      .filter((l) => l.startsWith("❯"));
    if (!inputs.some((l) => l.includes(line.slice(0, 30)))) return;
    tmux("send-keys", "-t", name, "Enter");
  }
};
const ask = async (card, question) => {
  const users = () => card.locator(".gl-user").count();
  const before = await users();
  for (let i = 0; i < 8 && (await users()) === before; i++) {
    await card.locator("textarea").fill(question);
    await card.locator("textarea").press("Enter");
    await sleep(1200);
  }
  expect(await users(), "the question was sent").toBe(before + 1);
};

/** Waits until the terminal has finished its turn. */
const idle = async (name) => {
  for (let i = 0; i < 90; i++) {
    if (!/esc to interrupt/.test(pane(name))) {
      await sleep(3000);
      if (!/esc to interrupt/.test(pane(name))) return;
    }
    await sleep(1000);
  }
  throw new Error(`${name} never went idle`);
};

/** liveU is started without the flag, liveA with it and opened last, so the
 * card shows liveA. */
const stamp = (what) =>
  console.log(`live324b ${new Date().toISOString().slice(11, 19)} ${what}`);
const pair = async (app, page, runtime, rec) => {
  stamp("start");
  await background(app);
  await reveal(page);
  startTerminal("liveU", FOLDER, runtime, "");
  await ready("liveU");
  type("liveU", "/blinkling:blinkling");
  await waitFor("liveU", /Blink|desktop_open/i);
  await sleep(5000);
  startTerminal("liveA", FOLDER, runtime);
  await ready("liveA");
  type("liveA", "/blinkling:blinkling");
  await waitFor("liveA", /Blink|desktop_open/i);
  await sleep(5000);
  await idle("liveU");
  await idle("liveA");
  stamp("terminals ready");
  const card = await openCard(app, page);
  await expect
    .poll(
      () => card.locator('.gl-chat-tab[aria-selected="true"]').textContent(),
      { timeout: 20000 },
    )
    .toContain("alpha #2");
  rec.frame("two-sessions");

  return card;
};

test("a question asked in Blink while the terminal is busy with its own prompt", async () => {
  test.setTimeout(900000);
  const { runtime, restore } = await pinToTree();
  const { app, page } = await launch({
    env: { BLINKLING_RUNTIME_DIR: runtime },
  });
  const rec = record("busy_terminal", {
    suffix: "-324",
    fps: 2,
    also: ["one_session_one_chat"],
  });
  try {
    const card = await pair(app, page, runtime, rec);
    // busy_terminal: the terminal works on its own prompt for 40 seconds; a
    // question asked in Blink meanwhile is answered too.
    await send(
      "liveA",
      'Run this shell command: python3 -c "import time; time.sleep(40)" and when it is finished reply with the single word FINISHED-40.',
    );
    await sleep(4000);
    await ask(card, "Reply with the single word DELTA and nothing else.");
    stamp("asked");
    rec.frame("blink-question-while-busy");
    await expect
      .poll(() => said(card), { timeout: 120000 })
      .toMatch(/FINISHED-40/);
    await expect
      .poll(
        async () =>
          (await said(card)).split("\n").some((t) => t.startsWith("DELTA")),
        {
          timeout: 120000,
        },
      )
      .toBe(true);
    await sleep(8000);
    const busy = await text(card);
    await save("busy_terminal-324-chat.txt", busy);
    await save("busy_terminal-324-terminal-A.txt", pane("liveA"));
    const bubbles = await card
      .locator(".gl-assistant")
      .evaluateAll((els) => els.map((el) => el.textContent));
    const own = bubbles.findIndex((t) => t.includes("FINISHED-40"));
    const blinks = bubbles.flatMap((t, i) =>
      t.startsWith("DELTA") ? [i] : [],
    );
    console.log(
      `live324b busy: own=${own} blink=${blinks.join(",")} bubbles=${bubbles.length}`,
    );
    expect(
      bubbles.filter((t) => t.includes("FINISHED-40")).length,
      "the terminal's own answer, once",
    ).toBe(1);
    expect(blinks.length, "the Blink answer, once").toBe(1);
    expect(
      own,
      "the terminal's answer comes first, as it came first",
    ).toBeLessThan(blinks[0]);
    rec.frame("both-answers");
  } catch (error) {
    console.log(`live324b FAIL ${String(error.message).slice(0, 600)}`);
    await save("live324b-debug-A.txt", pane("liveA")).catch(() => {});
    await save("live324b-debug-U.txt", pane("liveU")).catch(() => {});
    await save(
      "live324b-debug-card.txt",
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

test("Auto explain stays inside Blink beside linked sessions, and both sessions hear when Blink is closed", async () => {
  test.setTimeout(900000);
  const { runtime, restore } = await pinToTree();
  const { app, page } = await launch({
    env: { BLINKLING_RUNTIME_DIR: runtime },
  });
  const rec = record("auto_explain_local", {
    suffix: "-324",
    fps: 2,
    also: ["quit_notice"],
  });
  try {
    const card = await pair(app, page, runtime, rec);
    // auto_explain_local: the same turn the watcher sends, twice.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ).toString("base64");
    const users = await card.locator(".gl-user").count();
    const answersBefore = await card.locator(".gl-assistant").count();
    for (const round of [1, 2]) {
      const sent = await app.evaluate(
        (_e, [round, prompt, data]) =>
          globalThis.blinklingTest.session
            .send({
              id: crypto.randomUUID(),
              text: prompt,
              attachments: [
                {
                  id: `auto-img-${round}`,
                  name: "Screen.png",
                  mediaType: "image/png",
                  data,
                },
              ],
              source: "auto-explain",
            })
            .then(
              () => "sent",
              (error) => `refused: ${error.code ?? ""} ${error.message}`,
            ),
        [round, EXPLAIN_PROMPT, png],
      );
      stamp(`round ${round}: ${sent}`);
      await expect
        .poll(() => card.locator(".gl-assistant").count(), { timeout: 90000 })
        .toBe(answersBefore + round);
      await sleep(6000);
      expect(
        await card.locator(".gl-assistant").count(),
        `one answer for round ${round}`,
      ).toBe(answersBefore + round);
      rec.frame(`auto-explain-round-${round}`);
    }
    await sleep(10000);
    const after = await text(card);
    await save("auto_explain_local-324-chat.txt", after);
    await save("auto_explain_local-324-terminal-A.txt", pane("liveA"));
    await save("auto_explain_local-324-terminal-U.txt", pane("liveU"));
    for (const name of ["liveA", "liveU"]) {
      const transcript = pane(name);
      expect(transcript, `${name} was not asked`).not.toMatch(
        /Only look and explain/i,
      );
    }
    expect(await card.locator(".gl-user").count(), "no prompt bubble").toBe(
      users,
    );
    expect(after).not.toMatch(/did not answer in time|沒有及時回答|未能及時/);

    // quit_notice: Blink is closed with the quit key path of the shell.
    await app.evaluate(({ app }) => app.quit());
    await sleep(12000);
    type("liveU", "hello");
    await waitFor("liveU", /Blink was closed/, 60);
    await waitFor("liveA", /Blink was closed/, 60);
    await save("quit_notice-324-terminal-A.txt", pane("liveA"));
    await save("quit_notice-324-terminal-U.txt", pane("liveU"));
    rec.frame("quit-notice");
  } catch (error) {
    console.log(`live324b FAIL ${String(error.message).slice(0, 600)}`);
    await save("live324b-debug-A.txt", pane("liveA")).catch(() => {});
    await save("live324b-debug-U.txt", pane("liveU")).catch(() => {});
    await save(
      "live324b-debug-card.txt",
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

test("a flagged session that does not take the question: the same chat, no old messages, one note, one answer", async () => {
  test.setTimeout(600000);
  const { runtime, restore } = await pinToTree();
  const { app, page } = await launch({
    env: { BLINKLING_RUNTIME_DIR: runtime },
  });
  const rec = record("channel_fallback", { suffix: "-324", fps: 2 });
  try {
    await background(app);
    await reveal(page);
    startTerminal("liveA", FOLDER, runtime);
    await ready("liveA");
    type("liveA", "/blinkling:blinkling");
    await waitFor("liveA", /Blink|desktop_open/i);
    await sleep(5000);
    await idle("liveA");
    const card = await openCard(app, page);
    // Some history first, so that "no old messages" means something.
    await ask(card, "Reply with the single word ONE and nothing else.");
    await expect.poll(() => said(card), { timeout: 90000 }).toMatch(/ONE/);
    const answers = await card.locator(".gl-assistant").count();
    rec.frame("before");
    // The terminal is busy with a command of its own, so it does not take the
    // channel event within the delivery time.
    await send(
      "liveA",
      'Run this shell command: python3 -c "import time; time.sleep(40)" and when it is finished reply with the single word DONE-40.',
    );
    await sleep(4000);
    await ask(card, "Reply with the single word TWO and nothing else.");
    // The terminal's own answer comes first; Blink then answers the question
    // the terminal did not take, with one line saying so.
    await expect
      .poll(() => card.locator(".gl-assistant").count(), { timeout: 150000 })
      .toBe(answers + 3);
    await sleep(8000);
    rec.frame("note-and-answer");
    const bubbles = await card
      .locator(".gl-assistant")
      .evaluateAll((els) => els.map((el) => el.textContent));
    stamp(`new bubbles: ${JSON.stringify(bubbles.slice(-3))}`);
    expect(bubbles.length, "its own answer, one note, one answer").toBe(
      answers + 3,
    );
    expect(bubbles.at(-3), "the terminal's own answer").toMatch(/DONE-40/);
    expect(bubbles.at(-2), "the note").toMatch(/Blink/);
    expect(bubbles.at(-1), "the answer").toMatch(/^TWO/);
    expect(
      (await card.locator(".gl-user").allTextContents()).filter((t) =>
        t.startsWith("Reply with the single word ONE"),
      ).length,
      "the earlier question once, no replayed history",
    ).toBe(1);
    expect(
      (await said(card)).split("\n").filter((t) => t.startsWith("TWO")).length,
      "Blink's answer once",
    ).toBe(1);
    await save("channel_fallback-324-chat.txt", await text(card));
    await save("channel_fallback-324-terminal-A.txt", pane("liveA"));
    rec.frame("after-terminal-answer");
  } catch (error) {
    console.log(`live324b FAIL ${String(error.message).slice(0, 600)}`);
    await save("live324b-debug-A.txt", pane("liveA")).catch(() => {});
    await save(
      "live324b-debug-card.txt",
      await text(cardPage(app)).catch(() => ""),
    ).catch(() => {});
    throw error;
  } finally {
    endTerminals(["liveA"]);
    await rec.stop();
    await app.close().catch(() => {});
    await restore();
  }
});
