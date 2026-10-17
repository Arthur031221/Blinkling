import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { say } from "./strings.mjs";
import {
  ChannelChat,
  ChatRouter,
  channelAttachments,
  channelText,
} from "./router.mjs";

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

async function setup({
  settleMs = 5,
  deliveryMs = 60000,
  busyWaitMs,
  locale = "en",
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "router-"));
  const main = fakeBridge("main");
  const frames = [];
  let taken = true;
  const bridges = new Map();
  const channels = [];
  const router = new ChatRouter({
    main,
    locale: () => locale,
    makeBridge: (session) => {
      const b = fakeBridge(session);
      bridges.set(session, b);
      return b;
    },
    makeChannel: (session) => {
      const channel = new ChannelChat({
        directory: join(dir, session),
        settleMs,
        deliveryMs,
        busyWaitMs,
        note: (key) => say(locale)(key),
        deliver: (frame) => {
          frames.push({ session, ...frame });
          return taken;
        },
      });
      channels.push(channel);
      return channel;
    },
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
    // A save still in flight would make its folder again under the removal.
    close: async () => {
      await Promise.all(channels.map((channel) => channel.flush()));
      await rm(dir, { recursive: true, force: true });
    },
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
  assert.equal(t.frames[0].text, "what is this?", "exactly the words typed");
  assert.equal(t.frames[0].pictures, 1);
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

test("a question the terminal session never starts on is answered by Blink's own session, once, with one line saying so", async () => {
  const t = await setup({ deliveryMs: 20 });
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  const q = turn("are you there");
  await t.router.send(q);
  assert.equal(t.frames.length, 1);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(t.main.sent.length, 1, "Blink's session got the question");
  assert.equal(t.main.sent[0].id, q.id);
  assert.equal(t.router.currentKey, "blink");
  const notes = t.events.filter(
    (e) =>
      e.type === "message" && e.content?.[0]?.text === say("en")("undelivered"),
  );
  assert.equal(notes.length, 1);
  // The terminal answers late: that answer is dropped, so there is one answer.
  assert.equal(
    t.router.reply({ session: "s1", text: "Late answer." }),
    "late",
    "told so the terminal can stop",
  );
  assert.equal(
    t.router.turnEnd({ session: "s1", text: "Late answer." }),
    false,
  );
  assert.equal(
    t.events.filter(
      (e) => e.type === "message" && e.content?.[0]?.text === "Late answer.",
    ).length,
    0,
  );
  // A later question to that chat is delivered to the terminal again.
  t.router.switchTo("s1");
  await t.router.send(turn("again"));
  assert.equal(t.frames.length, 2);
  await t.close();
});

test("a question the terminal session starts on in time, however slowly it then answers, is not taken over", async () => {
  const t = await setup({ deliveryMs: 30 });
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send(turn("long task"));
  assert.equal(t.router.turnStart({ session: "s1" }), true);
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(t.main.sent.length, 0);
  assert.ok(t.router.reply({ session: "s1", text: "Done." }));
  await t.close();
});

test("an answer inside the delivery time clears the wait", async () => {
  const t = await setup({ deliveryMs: 30 });
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send(turn("quick"));
  assert.ok(t.router.reply({ session: "s1", text: "Yes." }));
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(t.main.sent.length, 0);
  await t.close();
});

test("channelText is exactly the words typed; pictures and files travel as attributes", () => {
  const message = {
    content: [
      { type: "image", source: {} },
      { type: "image", source: {} },
      { type: "document", title: "a.pdf" },
      { type: "text", text: "這是什麼" },
    ],
  };
  assert.equal(channelText(message), "這是什麼");
  assert.deepEqual(channelAttachments(message), {
    pictures: 2,
    files: ["a.pdf"],
  });
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
    // However many saves are asked for, the file is written by one at a time.
    const write = chat.write.bind(chat);
    let running = 0,
      most = 0,
      calls = 0;
    chat.write = async () => {
      calls++;
      most = Math.max(most, ++running);
      try {
        await write();
      } finally {
        running--;
      }
    };
    await Promise.all([chat.save(), chat.save(), chat.save(), chat.flush()]);
    assert.ok(calls >= 3, "every save is written");
    assert.equal(most, 1, "never two writes at once");
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

test("one question has one answer: a later reply takes the place of the earlier one", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  const q = turn("slow one");
  await t.router.send(q);
  assert.ok(t.router.reply({ session: "s1", turn: q.id, text: "Running it." }));
  assert.ok(t.router.reply({ session: "s1", turn: q.id, text: "It is 42." }));
  const chat = t.router.chats.get("s1").impl;
  const answers = chat.messages.filter((m) => m.role === "assistant");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].content[0].text, "It is 42.");
  // The wait ended, and an answer that comes after it still replaces in place.
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(
    t.router.reply({ session: "s1", turn: q.id, text: "It is 42, checked." }),
  );
  assert.equal(chat.messages.filter((m) => m.role === "assistant").length, 1);
  await t.close();
});

test("a late reply names its question and never becomes the answer to the next one", async () => {
  const t = await setup();
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  const first = turn("first");
  const second = turn("second");
  await t.router.send(first);
  assert.ok(t.router.reply({ session: "s1", turn: first.id, text: "One." }));
  await t.router.send(second);
  assert.ok(
    t.router.reply({ session: "s1", turn: first.id, text: "One, again." }),
  );
  const chat = t.router.chats.get("s1").impl;
  const bubble = (id) => chat.messages.find((m) => m.id === `reply-${id}`);
  assert.equal(bubble(first.id).content[0].text, "One, again.");
  assert.equal(bubble(second.id), undefined, "the second is still unanswered");
  assert.ok(chat.active === second.id, "its wait did not end");
  assert.equal(
    t.router.reply({ session: "s1", turn: "never-asked", text: "Who?" }),
    false,
  );
  await t.close();
});

test("a terminal that is busy keeps the question, and Blink answers only when the wait is over", async () => {
  const t = await setup({ deliveryMs: 25, busyWaitMs: 140 });
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  t.router.busy({ session: "s1", busy: true });
  await t.router.send(turn("while you work"));
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(t.main.sent.length, 0, "still waiting for the busy terminal");
  // The terminal took it after all.
  assert.equal(t.router.turnStart({ session: "s1" }), true);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(t.main.sent.length, 0, "taken, so never answered twice");
  await t.close();
});

test("a busy terminal that never takes the question is given up on once it is free or the wait runs out", async () => {
  const free = await setup({ deliveryMs: 25, busyWaitMs: 5000 });
  free.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  free.router.busy({ session: "s1", busy: true });
  await free.router.send(turn("free soon"));
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(free.main.sent.length, 0);
  free.router.busy({ session: "s1", busy: false });
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(free.main.sent.length, 1, "free and silent: Blink answers");
  await free.close();
  const long = await setup({ deliveryMs: 25, busyWaitMs: 60 });
  long.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  long.router.busy({ session: "s1", busy: true });
  await long.router.send(turn("too long"));
  await new Promise((r) => setTimeout(r, 140));
  assert.equal(long.main.sent.length, 1, "the wait has a limit");
  await long.close();
});

test("the line that says why Blink answered is in the language the person reads", async () => {
  const t = await setup({ deliveryMs: 20, locale: "zh-TW" });
  t.router.link({ session: "s1", cwd: "/work/alpha", channel: true });
  await t.router.send(turn("在嗎"));
  await new Promise((r) => setTimeout(r, 80));
  const note = t.events.find(
    (e) => e.type === "message" && e.id === `undelivered-${t.main.sent[0].id}`,
  );
  assert.equal(note.content[0].text, say("zh-TW")("undelivered"));
  assert.notEqual(note.content[0].text, say("en")("undelivered"));
  await t.close();
});
