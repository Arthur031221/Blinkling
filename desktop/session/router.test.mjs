import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelChat, ChatRouter, channelText } from "./router.mjs";

const fakeBridge = (name) => {
  const listeners = new Set();
  const sent = [];
  const bridge = {
    name,
    sent,
    state: { messages: [], selection: { model: "haiku", effort: "low" } },
    status: { type: "status", state: "connected" },
    subscribe(listener) {
      listeners.add(listener);
      listener({ type: "status", state: "connected" });
      for (const m of bridge.state.messages) listener(m);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const l of listeners) l(event);
    },
    async send(turn) {
      sent.push(turn);
    },
    select: async (s) => s,
    stop: async () => {},
    connect: async () => {},
    dispose: async () => {},
  };
  return bridge;
};
const turn = (text, attachments = []) => ({
  id: randomUUID(),
  text,
  attachments,
  source: "composer",
});
const png = {
  id: "a",
  name: "shot.png",
  mediaType: "image/png",
  data: "iVBORw0KGgo=",
};

async function setup({ settleMs = 5 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "router-"));
  const main = fakeBridge("main");
  const frames = [];
  let taken = true;
  const bridges = new Map();
  const router = new ChatRouter({
    main,
    makeBridge: (session) => {
      const b = fakeBridge(session);
      bridges.set(session, b);
      return b;
    },
    makeChannel: (session) =>
      new ChannelChat({
        directory: join(dir, session),
        settleMs,
        deliver: (frame) => {
          frames.push({ session, ...frame });
          return taken;
        },
      }),
  });
  const events = [];
  router.subscribe((e) => events.push(e), { visible: true });
  return {
    dir,
    main,
    router,
    frames,
    events,
    bridges,
    close: () => rm(dir, { recursive: true, force: true }),
    refuse: () => (taken = false),
  };
}

test("a session started with the flag has its question answered by that session, once", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  const q = turn("what is this?", [png]);
  await t.router.send(q);
  assert.equal(t.frames.length, 1);
  assert.equal(t.frames[0].turn, q.id);
  assert.match(t.frames[0].text, /what is this\?/);
  assert.match(t.frames[0].text, /blinkling_chat_images/);
  // Blink's own session never also gets the turn.
  assert.equal(t.main.sent.length, 0);
  assert.equal(t.router.images("s1").length, 1);
  assert.ok(t.router.reply({ session: "s1", text: "A screenshot." }));
  await new Promise((r) => setTimeout(r, 30));
  const messages = t.events.filter((e) => e.type === "message");
  assert.deepEqual(
    messages.map((m) => m.role),
    ["user", "assistant"],
  );
  assert.equal(t.events.filter((e) => e.type === "done").length, 1);
  await t.close();
});

test("no raw channel markup or chat ids reach a bubble", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send(turn("hello"));
  t.router.reply({ session: "s1", text: "hi there" });
  await new Promise((r) => setTimeout(r, 30));
  for (const e of t.events.filter((e) => e.type === "message"))
    for (const b of e.content)
      assert.doesNotMatch(b.text ?? "", /<channel|chat_id|plugin:blinkling/);
  await t.close();
});

test("a plain text answer at the end of the turn is delivered once when no reply was made", async () => {
  const t = await setup({ settleMs: 5000 });
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send(turn("hello"));
  assert.ok(t.router.turnEnd({ session: "s1", text: "Plain answer." }));
  const answers = t.events.filter(
    (e) => e.type === "message" && e.role === "assistant",
  );
  assert.equal(answers.length, 1);
  assert.equal(t.events.filter((e) => e.type === "done").length, 1);
  // A later end of the same turn adds nothing.
  assert.equal(
    t.router.turnEnd({ session: "s1", text: "Plain answer." }),
    false,
  );
  await t.close();
});

test("a reply through the tool is not shown twice when the turn ends with the same text", async () => {
  const t = await setup({ settleMs: 5000 });
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send(turn("hello"));
  t.router.reply({ session: "s1", text: "Done." });
  t.router.turnEnd({ session: "s1", text: "Blink's reply was sent." });
  const answers = t.events.filter(
    (e) => e.type === "message" && e.role === "assistant",
  );
  assert.equal(answers.length, 1);
  await t.close();
});

test("a session without the flag is answered by its own bridge, and its terminal lines join the chat", async () => {
  const t = await setup();
  t.router.link({ session: "s2", cwd: "/work/beta", channel: false });
  const q = turn("explain");
  await t.router.send(q);
  assert.equal(t.bridges.get("s2").sent.length, 1);
  assert.equal(t.main.sent.length, 0);
  t.router.mirror({
    session: "s2",
    role: "user",
    text: "typed in terminal",
    id: "x1",
  });
  const line = t.events.find((e) => e.id === "terminal-x1");
  assert.equal(line.role, "user");
  await t.close();
});

test("two sessions have two chats and switching replays only the chosen one", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send(turn("first question"));
  t.router.link({ session: "s2", cwd: "/work/beta", channel: true });
  t.router.open("s2");
  const summary = t.events.filter((e) => e.type === "chat").at(-1);
  assert.equal(summary.key, "s2");
  assert.deepEqual(summary.chats.map((c) => c.label).sort(), ["alpha", "beta"]);
  t.events.length = 0;
  t.router.open("s1");
  const replayed = t.events.filter((e) => e.type === "message");
  assert.equal(replayed.length, 1);
  assert.ok(replayed[0].replay);
  assert.match(replayed[0].content[0].text, /first question/);
  await t.close();
});

test("the guide's own turns stay with Blink's session even when a terminal chat is shown", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send({ ...turn("analyse"), source: "guide" });
  assert.equal(t.main.sent.length, 1);
  assert.equal(t.frames.length, 0);
  await t.close();
});

test("a closed terminal session says so instead of waiting for an answer", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  t.refuse();
  await assert.rejects(t.router.send(turn("hello")), {
    code: "TERMINAL_CLOSED",
  });
  const last = t.events.filter((e) => e.type === "message").at(-1);
  assert.equal(last.role, "assistant");
  assert.equal(t.events.filter((e) => e.type === "done").length, 1);
  await t.close();
});

test("a terminal session that goes away with a question open answers it as closed, so the card does not wait for ever", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send(turn("anyone there"));
  t.events.length = 0;
  t.router.unlink("s1");
  const last = t.events.filter((e) => e.type === "message").at(-1);
  assert.equal(last?.role, "assistant");
  assert.match(last.content[0].text, /closed/);
  assert.equal(t.events.filter((e) => e.type === "done").length, 1);
  // A session that never had a question open adds nothing.
  t.events.length = 0;
  t.router.link({ session: "s2", cwd: "/work/beta", channel: true });
  t.router.unlink("s2");
  assert.equal(t.events.filter((e) => e.type === "message").length, 0);
  await t.close();
});

test("channelText names pictures and files and never carries markup", () => {
  const text = channelText({
    content: [
      { type: "image", source: {} },
      { type: "image", source: {} },
      { type: "document", title: "a.pdf" },
      { type: "text", text: "look" },
    ],
  });
  assert.match(text, /^look/);
  assert.match(text, /2 pictures/);
  assert.match(text, /a\.pdf/);
});

test("the first session to join takes the card from an empty Blink chat; the empty one leaves the list", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  const summary = t.events.filter((e) => e.type === "chat").at(-1);
  assert.equal(summary.key, "s1");
  assert.deepEqual(
    summary.chats.map((c) => c.key),
    ["s1"],
  );
  await t.close();
});

test("the same project folder in two sessions gets numbered labels", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  t.router.link({ session: "s2", cwd: "/other/alpha", channel: true });
  const labels = t.events
    .filter((e) => e.type === "chat")
    .at(-1)
    .chats.map((c) => c.label);
  assert.deepEqual(labels, ["alpha", "alpha #2"]);
  await t.close();
});

test("a chat read back from disk shows its history to a card that subscribed before the read ended", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-channel-"));
  try {
    const first = new ChannelChat({ directory, deliver: () => true });
    await first.loaded;
    first.add({
      id: "m1",
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
    first.add({
      id: "m2",
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
    });
    await first.save();
    const again = new ChannelChat({ directory, deliver: () => true });
    const seen = [];
    again.subscribe((e) => e.type === "message" && seen.push([e.id, e.replay]));
    await again.loaded;
    assert.deepEqual(seen, [
      ["m1", true],
      ["m2", true],
    ]);
    // A card that comes after the read gets them from the subscription.
    const late = [];
    again.subscribe((e) => e.type === "message" && late.push(e.id));
    assert.deepEqual(late, ["m1", "m2"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("two saves in flight at once both land and leave no temporary file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-channel-"));
  try {
    const chat = new ChannelChat({ directory, deliver: () => true });
    await chat.loaded;
    chat.add({
      id: "m1",
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
    await Promise.all([chat.save(), chat.save(), chat.save()]);
    const files = await readdir(directory);
    assert.deepEqual(files, ["channel.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the router hands out Blink's own remote identity, whichever chat is showing", async () => {
  const t = await setup();
  t.main.identity = () => ({ type: "identity", id: "remote-1" });
  assert.deepEqual(t.router.identity(), { type: "identity", id: "remote-1" });
  await t.close();
});
