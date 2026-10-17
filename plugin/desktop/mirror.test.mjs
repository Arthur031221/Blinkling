import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isNotice, mirror, mirrorLine } from "./mirror.mjs";
import { startDesktopHost, MIRROR_LIMIT } from "./host.mjs";
import { discoverDesktop } from "./client.mjs";

test("a prompt and a finished answer become lines, and nothing else does", () => {
  const prompt = mirrorLine({
    hook_event_name: "UserPromptSubmit",
    session_id: "s1",
    prompt: "hello",
  });
  assert.equal(prompt.role, "user");
  assert.equal(prompt.text, "hello");
  const answer = mirrorLine({
    hook_event_name: "Stop",
    session_id: "s1",
    last_assistant_message: "hi there",
  });
  assert.equal(answer.role, "assistant");
  assert.notEqual(prompt.id, answer.id);
  assert.match(prompt.id, /^[\w.:-]{1,160}$/);
  for (const payload of [
    { hook_event_name: "SessionStart", session_id: "s1" },
    { hook_event_name: "Stop", session_id: "s1", last_assistant_message: " " },
    { hook_event_name: "UserPromptSubmit", prompt: "no session" },
    {},
    undefined,
  ])
    assert.equal(mirrorLine(payload), undefined);
  assert.equal(
    mirrorLine({
      hook_event_name: "Stop",
      session_id: "s1",
      last_assistant_message: "x".repeat(MIRROR_LIMIT + 50),
    }).text.length,
    MIRROR_LIMIT,
  );
});

test("a line Blink sent to the terminal as a channel event is not mirrored back", () => {
  const echoed = mirrorLine({
    hook_event_name: "UserPromptSubmit",
    session_id: "s1",
    prompt:
      '<channel source="plugin:blinkling:blinkling" kind="question" turn="m_1">fix the build</channel>',
  });
  assert.equal(echoed, undefined);
  // A server added by hand names itself without the plugin prefix.
  assert.equal(
    mirrorLine({
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt: '<channel source="blinkling" turn="m_1">fix the build</channel>',
    }),
    undefined,
  );
  // A person who types the word channel is still mirrored.
  assert.equal(
    mirrorLine({
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt: "what is a <channel> tag?",
    }).role,
    "user",
  );
});

test("only a session that opened Blink reaches it, and Blink refuses a bad line", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-mirror-"));
  const lines = [];
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
    onMirror: (line) => lines.push(line),
  });
  try {
    const payload = {
      hook_event_name: "UserPromptSubmit",
      session_id: "mine",
      prompt: "hello",
    };
    assert.equal(await mirror(payload, directory), false, "no sessions yet");
    await writeFile(
      join(directory, "sessions.json"),
      JSON.stringify([{ id: "mine", at: Date.now() }]),
    );
    assert.equal(await mirror(payload, directory), true);
    assert.equal(
      await mirror({ ...payload, session_id: "other" }, directory),
      false,
    );
    assert.deepEqual(
      lines.map((l) => [l.role, l.text]),
      [["user", "hello"]],
    );
    const { client } = await discoverDesktop(join(directory, "desktop.json"));
    for (const bad of [
      { role: "system", id: "x", text: "hi" },
      { role: "user", id: "bad id!", text: "hi" },
      { role: "user", id: "x", text: "" },
      { role: "user", id: "x", text: "y".repeat(MIRROR_LIMIT + 1) },
    ])
      await assert.rejects(client.rpc("mirror", bad), /Invalid mirrored line/);
    assert.equal(lines.length, 1);
  } finally {
    await host.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("without Blink running the hook does nothing and does not fail", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-mirror-"));
  try {
    await writeFile(
      join(directory, "sessions.json"),
      JSON.stringify([{ id: "mine", at: Date.now() }]),
    );
    assert.equal(
      await mirror(
        {
          hook_event_name: "Stop",
          session_id: "mine",
          last_assistant_message: "ok",
        },
        directory,
      ),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the answer to a turn that began as a Blink channel event is not mirrored back but ends the turn in Blink, and the next typed turn is mirrored", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-mirror-"));
  const lines = [];
  const ends = [];
  const starts = [];
  const host = await startDesktopHost({
    onTurnStart: (start) => starts.push(start.session),
    directory,
    descriptor: join(directory, "desktop.json"),
    onMirror: (line) => lines.push([line.role, line.text]),
    onTurnEnd: (end) => ends.push([end.session, end.text]),
  });
  try {
    await writeFile(
      join(directory, "sessions.json"),
      JSON.stringify([{ id: "mine", at: Date.now() }]),
    );
    const prompt = (text) => ({
      hook_event_name: "UserPromptSubmit",
      session_id: "mine",
      prompt: text,
    });
    const stop = (text) => ({
      hook_event_name: "Stop",
      session_id: "mine",
      last_assistant_message: text,
    });
    // A turn typed in the terminal: both sides are mirrored.
    await mirror(prompt("typed question"), directory);
    await mirror(stop("typed answer"), directory);
    // A turn Blink started: the prompt hook skips it and so does the Stop hook.
    await mirror(
      prompt(
        '<channel source="plugin:blinkling:blinkling" kind="question" turn="t1">from blink</channel>',
      ),
      directory,
    );
    // Blink is told the terminal took the question.
    assert.deepEqual(starts, ["mine"]);
    assert.equal(await mirror(stop("answer to blink"), directory), true);
    assert.deepEqual(ends, [["mine", "answer to blink"]]);
    // Back in the terminal.
    await mirror(prompt("typed again"), directory);
    assert.equal(await mirror(stop("answer again"), directory), true);
    assert.deepEqual(lines, [
      ["user", "typed question"],
      ["assistant", "typed answer"],
      ["user", "typed again"],
      ["assistant", "answer again"],
    ]);
  } finally {
    await host.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the markers Claude Code puts for a pasted picture or text are not mirrored into Blink's chat", () => {
  const line = (prompt) =>
    mirrorLine({
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt,
    });
  assert.equal(line("[Image #1] what is this").text, "what is this");
  assert.equal(
    line("look [Image #2] and [Image #3] please").text,
    "look and please",
  );
  assert.equal(
    line("[Pasted text #1 +42 lines] summarize this").text,
    "summarize this",
  );
  assert.equal(line("[Image #1]"), undefined, "nothing typed, nothing to show");
  assert.equal(line("no marker here").text, "no marker here");
});

test("a long paste reaches Blink as the words pasted, with its line breaks, and not as the tag Claude Code wraps it in", () => {
  const line = (prompt) =>
    mirrorLine({
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt,
    });
  const pasted =
    'check this [Pasted text #2 +3 lines] <pasted_content id="a798">\nline 1: one\nline 2: two\n\nline 4: four\n</pasted_content id="a798">';
  const shown = line(pasted).text;
  assert.equal(shown, "check this line 1: one\nline 2: two\n\nline 4: four");
  assert.doesNotMatch(shown, /pasted_content/);
  assert.equal(
    line('<pasted_content id="b1">only paste</pasted_content>').text,
    "only paste",
  );
  assert.equal(
    line('<pasted_content id="b1">\n\n</pasted_content>'),
    undefined,
    "an empty paste is nothing to show",
  );
});

test("a notice Claude Code made itself is not a person's message, and neither is the answer to it", async () => {
  for (const prompt of [
    "<task-notification>\n<task-id>b1</task-id>\n<output-file>/tmp/x.output</output-file>\n<status>completed</status>\n</task-notification>",
    "<system-reminder>be brief</system-reminder>",
    "<local-command-stdout>ok</local-command-stdout>",
    "<command-name>/clear</command-name>",
  ]) {
    assert.equal(isNotice(prompt), true, prompt);
    assert.equal(
      mirrorLine({
        hook_event_name: "UserPromptSubmit",
        session_id: "s1",
        prompt,
      }),
      undefined,
    );
  }
  assert.equal(isNotice("what does <task-notification> mean?"), false);
  const directory = await mkdtemp(join(tmpdir(), "glimpse-mirror-"));
  const lines = [];
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
    onMirror: (l) => lines.push([l.role, l.text]),
  });
  try {
    await writeFile(
      join(directory, "sessions.json"),
      JSON.stringify([{ id: "mine", at: Date.now() }]),
    );
    const hook = (extra) => ({ session_id: "mine", ...extra });
    await mirror(
      hook({
        hook_event_name: "UserPromptSubmit",
        prompt:
          "<task-notification><status>completed</status></task-notification>",
      }),
      directory,
    );
    assert.equal(
      await mirror(
        hook({
          hook_event_name: "Stop",
          last_assistant_message: "the build finished",
        }),
        directory,
      ),
      false,
    );
    await mirror(
      hook({ hook_event_name: "UserPromptSubmit", prompt: "thanks" }),
      directory,
    );
    await mirror(
      hook({ hook_event_name: "Stop", last_assistant_message: "welcome" }),
      directory,
    );
    assert.deepEqual(lines, [
      ["user", "thanks"],
      ["assistant", "welcome"],
    ]);
  } finally {
    await host.close();
    await rm(directory, { recursive: true, force: true });
  }
});
