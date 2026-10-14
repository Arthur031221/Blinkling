import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DesktopSessionBridge } from "./bridge.mjs";

class Transport extends EventEmitter {
  sent = [];
  calls = [];
  selection = { model: "claude-haiku-5-5", effort: "low" };
  async connect(options) {
    this.options = options;
    this.emit("event", {
      type: "system",
      subtype: "bridge_state",
      state: "connected",
      session_id: options.localId,
    });
    return {
      session_url: "https://claude.ai/code/session_test",
      bridge_session_id: options.remoteId ?? "cse_test",
    };
  }
  async getSelection() {
    return this.selection;
  }
  async select(selection) {
    this.calls.push(structuredClone(selection));
    this.selection = {
      ...selection,
      model:
        selection.model === "sonnet" ? "claude-sonnet-5-5" : selection.model,
    };
    if (selection.effort === "max") throw new Error("unsupported effort");
    return this.selection;
  }
  async send(turn) {
    this.sent.push(structuredClone(turn));
  }
  async stop() {
    this.stopped = true;
  }
  async dispose() {
    this.disposed = true;
  }
  finish(turn = this.sent.at(-1), text = "OK") {
    this.emit("event", {
      type: "user",
      uuid: turn.id,
      message: { content: [{ type: "text", text: turn.text }] },
    });
    this.emit("event", {
      type: "assistant",
      uuid: randomUUID(),
      message: { id: `answer-${turn.id}`, content: [{ type: "text", text }] },
    });
    this.emit("event", {
      type: "result",
      uuid: randomUUID(),
      subtype: "success",
    });
  }
}
const turn = (source = "composer") => ({
  id: randomUUID(),
  text: "What?",
  source,
  attachments: [
    {
      id: "image",
      name: "capture.png",
      mediaType: "image/png",
      data: "aGVsbG8=",
    },
  ],
});

test("streamed tokens reach subscribers without a full image/history disk rewrite per token", async (t) => {
  const { bridge, children, events } = await setup(t);
  await bridge.connect();
  const save = bridge.store.save.bind(bridge.store);
  let writes = 0;
  bridge.store.save = (state) => {
    writes++;
    return save(state);
  };
  const child = children[0];
  child.emit("event", {
    type: "stream_event",
    event: { type: "message_start", message: { id: "streamed" } },
  });
  for (let index = 0; index < 100; index++)
    child.emit("event", {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "x" },
      },
    });
  await waitFor(
    () => events.filter((event) => event.type === "delta").length === 100,
  );
  assert.ok(writes < 5, `a 100-token burst caused ${writes} snapshots`);
  await bridge.dispose();
  assert.equal(
    (await bridge.store.load()).messages[0].content[0].text,
    "x".repeat(100),
  );
});
async function waitFor(predicate) {
  const end = Date.now() + 2500;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("condition timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}
async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-session-"));
  const children = [];
  const bridge = new DesktopSessionBridge({
    userDataDir: dir,
    cwd: dir,
    transportFactory: () => {
      const child = new Transport();
      children.push(child);
      return child;
    },
    retry: { minMs: 5, maxMs: 15 },
    readTranscript: async () => [],
    ...options,
  });
  const events = [];
  bridge.subscribe((event) => events.push(event));
  t.after(async () => {
    await bridge.dispose();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, bridge, children, events };
}

test("all sources use one automatically owned identity, preserve attachments and deduplicate turns", async (t) => {
  const { bridge, children, events, dir } = await setup(t);
  await bridge.connect("a-live-parent-that-must-not-be-resumed");
  const child = children[0];
  assert.notEqual(
    child.options.localId,
    "a-live-parent-that-must-not-be-resumed",
  );
  for (const source of [
    "composer",
    "quick-ask",
    "guide",
    "auto-explain",
    "companion",
  ]) {
    const value = turn(source);
    await bridge.send(value);
    await waitFor(
      () =>
        child.sent.length ===
        ["composer", "quick-ask", "guide", "auto-explain", "companion"].indexOf(
          source,
        ) +
          1,
    );
    await bridge.send(value);
    child.finish(value);
    await waitFor(() =>
      events.some((e) => e.type === "done" && e.turnId === value.id),
    );
  }
  assert.equal(children.length, 1);
  assert.equal(child.sent.length, 5);
  assert.ok(child.sent.every((x) => x.attachments[0].data === "aGVsbG8="));
  const state = JSON.parse(
    await readFile(join(dir, "session/state.json"), "utf8"),
  );
  assert.equal(state.remoteId, "cse_test");
  assert.equal(state.selection.model, "claude-haiku-5-5");
  assert.ok(state.lastEventId);
  const changed = { ...child.sent[0], text: "different" };
  await assert.rejects(bridge.send(changed), /different content/);
});

test("remote human messages, partial streaming and final messages share stable IDs; protocol output is not chat", async (t) => {
  const { bridge, children, events } = await setup(t);
  await bridge.connect();
  const child = children[0];
  const emit = (event) => child.emit("event", event);
  emit({
    type: "user",
    uuid: "browser-human",
    message: { content: [{ type: "text", text: "Hello from browser" }] },
  });
  emit({
    type: "stream_event",
    uuid: "start",
    event: { type: "message_start", message: { id: "answer-remote" } },
  });
  emit({
    type: "stream_event",
    uuid: "delta",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hi." },
    },
  });
  emit({
    type: "stream_event",
    uuid: "delta",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hi." },
    },
  });
  emit({
    type: "assistant",
    uuid: "final",
    message: { id: "answer-remote", content: [{ type: "text", text: "Hi." }] },
  });
  emit({
    type: "user",
    uuid: "control-chat",
    message: {
      content: "<local-command-stdout>Set model</local-command-stdout>",
    },
  });
  emit({ type: "result", uuid: "done-remote" });
  await waitFor(() => events.some((e) => e.type === "done"));
  assert.equal(events.filter((e) => e.type === "delta").length, 1);
  assert.equal(events.find((e) => e.type === "delta").id, "answer-remote");
  assert.ok(
    events.some((e) => e.type === "message" && e.id === "browser-human"),
  );
  assert.ok(
    !events.some((e) => e.type === "message" && e.id === "control-chat"),
  );
  assert.ok(
    !events.some(
      (e) => e.type === "message" && JSON.stringify(e).includes("連線已中斷"),
    ),
  );
  const replay = [];
  const unsubscribe = bridge.subscribe((e) => replay.push(e));
  unsubscribe();
  assert.equal(
    replay.filter((e) => e.type === "message" && e.id === "answer-remote")
      .length,
    1,
  );
});

test("picker waits for the active turn, confirms real values and rolls back partially failed controls", async (t) => {
  const { bridge, children, events } = await setup(t);
  await bridge.connect();
  const child = children[0];
  const first = turn();
  await bridge.send(first);
  const picking = bridge.select({ model: "sonnet", effort: "medium" });
  const next = turn();
  const sending = bridge.send(next);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(child.calls.length, 0);
  child.finish(first);
  assert.deepEqual(await picking, {
    model: "claude-sonnet-5-5",
    effort: "medium",
  });
  await sending;
  await waitFor(() => child.sent.length === 2);
  child.finish(next);
  await waitFor(() => events.filter((e) => e.type === "done").length === 2);
  await assert.rejects(
    bridge.select({ model: "haiku", effort: "max" }),
    /unsupported/,
  );
  assert.deepEqual(child.selection, {
    model: "claude-sonnet-5-5",
    effort: "medium",
  });
  assert.deepEqual(
    events.filter((e) => e.type === "selection").at(-1).applied,
    child.selection,
  );
});

test("automatic reconnect reconciles an acknowledged turn before sending queued turns; no paid replay", async (t) => {
  const first = turn();
  const second = turn();
  let transcript = [];
  const { bridge, children, events } = await setup(t, {
    readTranscript: async () => transcript,
  });
  await bridge.connect();
  await bridge.send(first);
  await bridge.send(second);
  const old = children[0];
  transcript = [
    {
      type: "user",
      uuid: first.id,
      message: { content: [{ type: "text", text: first.text }] },
    },
    {
      type: "assistant",
      uuid: "final-on-disk",
      parentUuid: first.id,
      message: {
        id: "recovered-answer",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Recovered" }],
      },
    },
  ];
  old.emit("fault", new Error("connection lost"));
  await waitFor(() => children.length === 2 && children[1].sent.length === 1);
  assert.ok(old.disposed);
  assert.equal(children[1].options.localId, old.options.localId);
  assert.equal(children[1].options.remoteId, "cse_test");
  assert.equal(children[1].sent[0].id, second.id);
  assert.ok(
    events.some((e) => e.type === "message" && e.id === "recovered-answer"),
  );
  assert.ok(events.some((e) => e.type === "status" && e.state === "retrying"));
  children[1].finish(second);
});

test("a crash in the dispatch boundary preserves the outbox and never blindly repeats a paid turn", async (t) => {
  const { bridge, children, dir, events } = await setup(t);
  await bridge.connect();
  const value = turn();
  await bridge.send(value);
  children[0].emit("fault", new Error("crash before receipt"));
  await waitFor(
    () =>
      children.length === 2 &&
      events.some((e) => e.type === "status" && e.detail === "reconciling"),
  );
  assert.equal(children[1].sent.length, 0);
  const state = JSON.parse(
    await readFile(join(dir, "session/state.json"), "utf8"),
  );
  assert.equal(
    state.turns.find((x) => x.turn.id === value.id).state,
    "uncertain",
  );
  assert.ok(
    events.some((e) => e.type === "status" && e.detail === "reconciling"),
  );
});

test("Stop cancels an uncertain admission without replaying it and allows a new explicit turn", async (t) => {
  const { bridge, children, events } = await setup(t);
  await bridge.connect();
  const value = turn();
  await bridge.send(value);
  children[0].emit("fault", new Error("receipt lost"));
  await waitFor(
    () => bridge.state.turns[0].state === "uncertain" && bridge.ready,
  );
  await bridge.stop();
  assert.equal(bridge.state.turns[0].state, "cancelled");
  assert.ok(events.some((e) => e.type === "done" && e.turnId === value.id));
  // A delayed replay receipt must not revive an admission the user cancelled.
  children[1].emit("event", {
    type: "user",
    uuid: value.id,
    message: { content: [{ type: "text", text: value.text }] },
  });
  await bridge.events;
  assert.equal(bridge.state.turns[0].state, "cancelled");
  assert.equal(bridge.active, undefined);
  const next = turn();
  await bridge.send(next);
  assert.deepEqual(
    children[1].sent.map((x) => x.id),
    [next.id],
  );
  children[1].finish(next);
});

test("app restart preserves the original working directory, identity, selection and history", async (t) => {
  const { bridge, children, dir } = await setup(t);
  await bridge.connect();
  const value = turn();
  await bridge.send(value);
  children[0].finish(value);
  await waitFor(() => bridge.state.turns[0].state === "done");
  await bridge.select({ model: "sonnet", effort: "medium" });
  const identity = bridge.identity();
  const records = bridge.state.messages.map((message) => ({
    type: message.role,
    uuid: message.id,
    message: { id: message.id, content: message.content },
  }));
  await bridge.dispose();
  const child = new Transport();
  child.selection = { model: "claude-sonnet-5-5", effort: "medium" };
  const replacement = new DesktopSessionBridge({
    userDataDir: dir,
    cwd: join(dir, "a-different-project"),
    transportFactory: () => child,
    readTranscript: async () => records,
  });
  try {
    await replacement.connect();
    assert.equal(child.options.cwd, dir);
    assert.equal(child.options.sessionId, identity.localId);
    assert.deepEqual(replacement.identity(), identity);
    assert.deepEqual(replacement.state.selection, child.selection);
    assert.equal(
      replacement.state.messages.filter((m) => m.role === "assistant").length,
      1,
    );
    assert.equal(child.sent.length, 0);
  } finally {
    await replacement.dispose();
  }
});

test("failed selection persistence restores both the controls and the confirmed UI state", async (t) => {
  const { bridge, children } = await setup(t);
  await bridge.connect();
  const previous = { ...bridge.state.selection };
  const save = bridge.store.save.bind(bridge.store);
  let failing = true;
  bridge.store.save = (state) => {
    if (failing) {
      failing = false;
      return Promise.reject(new Error("disk unavailable"));
    }
    return save(state);
  };
  await assert.rejects(
    bridge.select({ model: "sonnet", effort: "medium" }),
    /disk unavailable/,
  );
  assert.deepEqual(bridge.state.selection, previous);
  assert.deepEqual(children[0].selection, previous);
  assert.deepEqual((await bridge.store.load()).selection, previous);
});

test("failed outbox persistence does not send or swallow a retry with the same UUID", async (t) => {
  const { bridge, children } = await setup(t);
  await bridge.connect();
  const save = bridge.store.save.bind(bridge.store);
  let failing = true;
  bridge.store.save = (state) => {
    if (failing) {
      failing = false;
      return Promise.reject(new Error("disk unavailable"));
    }
    return save(state);
  };
  const value = turn();
  await assert.rejects(bridge.send(value), /disk unavailable/);
  assert.equal(children[0].sent.length, 0);
  assert.equal(bridge.state.turns.length, 0);
  assert.equal(bridge.state.messages.length, 0);
  await bridge.send(value);
  assert.equal(children[0].sent.length, 1);
  assert.equal((await bridge.store.load()).messages[0].id, value.id);
  children[0].finish(value);
});

test("stop interrupts without waiting for picker; shutdown releases the single-writer lock and rejects waiting controls", async (t) => {
  const { bridge, children, dir } = await setup(t);
  await bridge.connect();
  await bridge.send(turn());
  const picking = bridge.select({ model: "sonnet", effort: "high" });
  const rejection = assert.rejects(picking, /closed/);
  await bridge.stop();
  assert.ok(children[0].stopped);
  await bridge.dispose();
  await rejection;
  assert.ok(children[0].disposed);
  const replacement = new DesktopSessionBridge({
    userDataDir: dir,
    cwd: dir,
    transportFactory: () => new Transport(),
    readTranscript: async () => [],
  });
  await replacement.connect();
  await replacement.dispose();
});

test("shutdown releases the writer lock even when its final durable checkpoint fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-shutdown-failure-"));
  const child = new Transport();
  const options = {
    userDataDir: dir,
    cwd: dir,
    transportFactory: () => child,
    readTranscript: async () => [],
  };
  const bridge = new DesktopSessionBridge(options);
  let replacement;
  try {
    await bridge.connect();
    bridge.store.save = async () => {
      throw new Error("disk unavailable on exit");
    };
    await assert.rejects(bridge.dispose(), /disk unavailable on exit/);
    assert.ok(child.disposed);
    assert.equal(bridge.store.held, false);
    replacement = new DesktopSessionBridge({
      ...options,
      transportFactory: () => new Transport(),
    });
    await replacement.connect();
    assert.deepEqual(replacement.identity(), bridge.identity());
  } finally {
    await bridge.dispose().catch(() => {});
    await replacement?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test("unverified versions are blocked without infinite retry or local-only answers", async (t) => {
  let attempts = 0;
  const { bridge, events } = await setup(t, {
    transportFactory: () => {
      const child = new Transport();
      child.connect = async () => {
        attempts++;
        throw Object.assign(
          new Error("Unverified Claude Code protocol version"),
          { code: "UNSUPPORTED_CLAUDE" },
        );
      };
      return child;
    },
  });
  await assert.rejects(bridge.connect(), /Unverified/);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(attempts, 1);
  assert.ok(events.some((e) => e.type === "status" && e.state === "blocked"));
});

test("connection recovery does not replay the same messages to an existing subscriber", async (t) => {
  const value = turn();
  const records = [
    { type: "user", uuid: value.id, message: { content: "Remote question" } },
    {
      type: "assistant",
      uuid: "answer-uuid",
      parentUuid: value.id,
      message: {
        id: "answer-id",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Remote answer" }],
      },
    },
  ];
  const { bridge, children, events } = await setup(t, {
    readTranscript: async () => records,
  });
  await bridge.connect();
  children[0].emit("fault", new Error("offline"));
  await waitFor(() => events.filter((e) => e.type === "identity").length === 2);
  assert.equal(
    events.filter((e) => e.type === "message" && e.id === "answer-id").length,
    1,
  );
});

test("silent picker fallback is rejected and the last confirmed selection is restored", async (t) => {
  const { bridge, children } = await setup(t);
  await bridge.connect();
  const transport = children[0];
  const select = transport.select.bind(transport);
  transport.select = async (selection) =>
    selection.model === "sonnet"
      ? { model: "claude-haiku-5-5", effort: "low" }
      : select(selection);
  await assert.rejects(
    bridge.select({ model: "sonnet", effort: "medium" }),
    /did not apply/,
  );
  assert.deepEqual(transport.selection, {
    model: "claude-haiku-5-5",
    effort: "low",
  });
});

test("Stop cancels the queue before an immediate interrupt result can admit the next turn", async (t) => {
  const { bridge, children, events } = await setup(t);
  await bridge.connect();
  const first = turn();
  const second = turn();
  await bridge.send(first);
  await bridge.send(second);
  const transport = children[0];
  transport.stop = async () => {
    transport.stopped = true;
    transport.emit("event", { type: "result", uuid: randomUUID() });
    await new Promise((r) => setTimeout(r, 20));
  };
  await bridge.stop();
  await waitFor(() => events.filter((e) => e.type === "done").length === 2);
  assert.equal(transport.sent.length, 1);
});

test("offline turns are queued durably and automatically admitted after the connection recovers", async (t) => {
  let attempts = 0;
  const { bridge, events, children } = await setup(t, {
    transportFactory: () => {
      const child = new Transport();
      const connect = child.connect.bind(child);
      child.connect = async (options) => {
        attempts++;
        if (attempts < 3) throw new Error("temporary network error");
        return connect(options);
      };
      children.push(child);
      return child;
    },
  });
  await bridge.connect();
  const value = turn();
  await bridge.send(value);
  await waitFor(() => attempts === 3 && children[2].sent.length === 1);
  children[2].finish(value);
  await waitFor(() =>
    events.some((e) => e.type === "done" && e.turnId === value.id),
  );
  assert.ok(children.slice(0, 2).every((child) => child.disposed));
});

test("guide and companion turns never reach visible subscribers, live or from history", async (t) => {
  const { bridge, children, events } = await setup(t);
  await bridge.connect();
  const visible = [];
  bridge.subscribe((event) => visible.push(event), { visible: true });
  const answers = {};
  for (const source of ["guide", "companion", "composer", "auto-explain"]) {
    const value = turn(source);
    value.text = `${source} prompt`;
    await bridge.send(value);
    await waitFor(() => children[0].sent.some((item) => item.id === value.id));
    children[0].emit("event", {
      type: "stream_event",
      event: { type: "message_start", message: { id: `answer-${value.id}` } },
    });
    children[0].emit("event", {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: `${source} reply` },
      },
    });
    children[0].finish(value, `${source} reply`);
    await waitFor(() =>
      visible
        .concat(events)
        .some((e) => e.type === "done" && e.turnId === value.id),
    );
    answers[source] = value;
  }
  const text = JSON.stringify(visible);
  assert.doesNotMatch(text, /guide (prompt|reply)|companion (prompt|reply)/);
  assert.match(text, /composer prompt/);
  assert.match(text, /composer reply/);
  assert.match(text, /auto-explain reply/);
  for (const source of ["guide", "companion"])
    assert.ok(
      !visible.some(
        (e) => e.type === "done" && e.turnId === answers[source].id,
      ),
      `${source} completion leaked`,
    );
  for (const source of ["composer", "auto-explain"])
    assert.ok(
      visible.some((e) => e.type === "done" && e.turnId === answers[source].id),
    );
  // The unfiltered stream still carries everything: internal callers collect their own turn.
  assert.match(JSON.stringify(events), /guide reply/);
  assert.match(JSON.stringify(events), /companion reply/);
  // A later subscriber (a reopened chat) replays visible history only.
  const history = [];
  bridge.subscribe((event) => history.push(event), { visible: true });
  const replay = JSON.stringify(history);
  assert.doesNotMatch(replay, /guide|companion/);
  assert.match(replay, /composer reply/);
  // Remote Control still sees everything: the durable state keeps the full transcript.
  assert.match(JSON.stringify(bridge.state.messages), /guide reply/);
});

test("a message typed remotely after an internal turn is visible again", async (t) => {
  const { bridge, children } = await setup(t);
  await bridge.connect();
  const visible = [];
  bridge.subscribe((event) => visible.push(event), { visible: true });
  const value = turn("guide");
  await bridge.send(value);
  await waitFor(() => children[0].sent.length === 1);
  children[0].finish(value, "hidden steps");
  children[0].emit("event", {
    type: "user",
    uuid: "remote-human",
    message: { content: [{ type: "text", text: "from my phone" }] },
  });
  children[0].emit("event", {
    type: "assistant",
    uuid: randomUUID(),
    message: {
      id: "remote-answer",
      content: [{ type: "text", text: "phone answer" }],
    },
  });
  await waitFor(() => visible.some((e) => e.id === "remote-answer"));
  assert.ok(visible.some((e) => e.id === "remote-human"));
  assert.doesNotMatch(JSON.stringify(visible), /hidden steps/);
});
