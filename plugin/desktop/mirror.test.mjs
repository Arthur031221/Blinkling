import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mirror, mirrorLine } from "./mirror.mjs";
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
