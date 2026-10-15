import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  stat,
  readFile,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { SessionStore, transcriptPath } from "./storage.mjs";
import { reconcileTranscript, chatMessage } from "./normalize.mjs";

test("single-writer storage serializes atomic private writes and can reopen", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-store-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const a = new SessionStore(dir);
  const b = new SessionStore(dir);
  await a.acquire();
  await assert.rejects(b.acquire(), { code: "SESSION_LOCKED" });
  const state = { schema: 1, localId: randomUUID(), turns: [], messages: [] };
  await Promise.all([
    a.save({ ...state, lastEventId: "first" }),
    a.save({ ...state, lastEventId: "second" }),
  ]);
  assert.equal((await a.load()).lastEventId, "second");
  if (process.platform !== "win32")
    assert.equal((await stat(a.file)).mode & 0o777, 0o600);
  await a.release();
  await b.acquire();
  assert.equal((await b.load()).localId, state.localId);
  await b.release();
});
test("invalid persistent state fails closed rather than opening a different paid session", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-store-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new SessionStore(dir);
  await store.acquire();
  await writeFile(
    store.file,
    '{"schema":1,"localId":"../../secret","turns":[],"messages":[]}',
  );
  await assert.rejects(store.load(), /Invalid saved/);
  await writeFile(
    store.file,
    JSON.stringify({
      schema: 1,
      localId: randomUUID(),
      turns: [null],
      messages: [],
    }),
  );
  await assert.rejects(store.load(), /Invalid saved/);
  await store.release();
});
test("stale writer locks recover, incomplete locks are not stolen", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-store-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new SessionStore(dir);
  await mkdir(store.lock, { recursive: true });
  await assert.rejects(store.acquire(), { code: "SESSION_LOCKED" });
  await writeFile(
    join(store.lock, "owner.json"),
    JSON.stringify({ pid: 2147483647, token: randomUUID() }),
  );
  await store.acquire();
  assert.ok(
    JSON.parse(await readFile(join(store.lock, "owner.json"))).pid ===
      process.pid,
  );
  await store.release();
});
test("transcripts are scoped to the owned UUID and project, not arbitrary paths", () => {
  const id = randomUUID();
  // Claude names the project folder after the absolute path with every
  // non-alphanumeric character replaced; on Windows that path starts with a drive.
  const folder =
    process.platform === "win32"
      ? `${resolve("/")[0]}--tmp-test-project`
      : "-tmp-test-project";
  assert.equal(
    transcriptPath("/tmp/test project", id, "/claude"),
    join("/claude", "projects", folder, `${id}.jsonl`),
  );
  assert.throws(() => transcriptPath("/tmp", "../../credentials"), /Invalid/);
});
test("transcript reconciliation follows meta parent links and never replays an accepted paid turn", () => {
  const state = {
    turns: [
      { turn: { id: "done" }, state: "dispatching" },
      { turn: { id: "interrupted" }, state: "accepted" },
      { turn: { id: "unclear" }, state: "dispatching" },
      { turn: { id: "not-sent" }, state: "queued" },
    ],
  };
  const records = [
    { type: "user", uuid: "done", message: { content: "Question" } },
    {
      type: "user",
      uuid: "meta",
      parentUuid: "done",
      isMeta: true,
      message: { content: "Image source" },
    },
    {
      type: "assistant",
      uuid: "final",
      parentUuid: "meta",
      message: {
        id: "answer",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Answer" }],
      },
    },
    { type: "user", uuid: "interrupted", message: { content: "Interrupted" } },
  ];
  const messages = reconcileTranscript(records, state);
  assert.deepEqual(
    state.turns.map((x) => x.state),
    ["done", "interrupted", "uncertain", "queued"],
  );
  assert.deepEqual(
    messages.map((x) => x.id),
    ["done", "answer", "interrupted"],
  );
});
test("tool output and slash-command protocol text stay out of conversation", () => {
  for (const event of [
    {
      type: "user",
      uuid: "a",
      message: { content: [{ type: "tool_result", content: "secret" }] },
    },
    {
      type: "assistant",
      uuid: "b",
      parent_tool_use_id: "tool",
      message: { content: "secret" },
    },
    {
      type: "user",
      uuid: "c",
      message: { content: "<command-name>/model</command-name>" },
    },
  ])
    assert.equal(chatMessage(event), null);
});
