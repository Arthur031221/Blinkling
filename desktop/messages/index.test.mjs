import test from "node:test";
import assert from "node:assert/strict";
import { createMessageStream } from "./index.mjs";

const say = (id, text) => ({
  type: "message",
  id,
  role: "assistant",
  content: [{ type: "text", text }],
});

test("replay replaces deltas once, history survives turns, status never becomes an answer", () => {
  const s = createMessageStream();
  s.accept({ type: "delta", id: "a", text: "Hello. " });
  s.accept({ type: "delta", id: "a", text: "Next." });
  s.accept(say("a", "Hello. Next."));
  s.accept(say("a", "Hello. Next."));
  s.accept({ type: "status", state: "retrying" });
  s.accept({
    type: "message",
    id: "remote",
    role: "user",
    content: [{ type: "text", text: "From phone" }],
  });
  s.accept({ type: "delta", id: "b", text: "Earlier answers stay." });
  s.accept({ type: "done", turnId: "t" });
  assert.equal(s.snapshot().length, 3);
  assert.equal(s.snapshot()[0].text, "Hello. Next.");
  assert.equal(s.snapshot()[2].complete, true);
  assert.equal(s.state().status, "retrying");
  const copy = s.snapshot();
  copy[0].text = "changed";
  assert.equal(s.snapshot()[0].text, "Hello. Next.");
});

test("replayed history is kept for the chat but is not a live turn", () => {
  const s = createMessageStream();
  s.accept({ ...say("old", "Yesterday's answer."), replay: true });
  s.accept({
    type: "message",
    id: "q",
    role: "user",
    replay: true,
    content: [{ type: "text", text: "Yesterday?" }],
  });
  s.accept({ type: "delta", id: "x", text: "stale", replay: true });
  assert.equal(s.snapshot().length, 2);
  assert.equal(s.state().working, false, "a replayed question is not waiting");
  assert.equal(s.state().speaking, false);
});

test("a typed question from anywhere starts the wait and the first text ends it", () => {
  const s = createMessageStream();
  s.accept({
    type: "message",
    id: "q",
    role: "user",
    content: [{ type: "text", text: "From the terminal" }],
  });
  assert.equal(s.state().working, true);
  s.accept({ type: "delta", id: "a", text: "Hi" });
  assert.equal(s.state().working, false);
  assert.equal(s.state().speaking, true);
});

test("working turns on when a question is sent and off once text streams or the turn ends", () => {
  const s = createMessageStream();
  assert.equal(s.state().working, false);
  s.accept({ type: "sending", seeing: true });
  assert.equal(s.state().working, true);
  assert.equal(s.state().seeing, true);
  s.accept({ type: "delta", id: "a", text: "Hi" });
  assert.equal(s.state().working, false);
  s.accept({ type: "activity", state: "thinking" });
  assert.equal(s.state().working, false, "streaming text replaces the dots");
  s.accept({ type: "done" });
  s.accept({ type: "sending" });
  assert.equal(s.state().seeing, false);
  s.accept({ type: "activity", state: "error" });
  assert.equal(s.state().working, false);
});

test("a blink-say line is one plain message, not split into sentences", () => {
  const s = createMessageStream();
  s.accept({ type: "blink-say", id: "s1", text: "Hi. I am here! Really." });
  const [line] = s.snapshot();
  assert.equal(line.plain, true);
  assert.equal(line.text, "Hi. I am here! Really.");
});

test("a blink-offer carries its action, a later line with the same id replaces it, and an incomplete one is ignored", () => {
  const s = createMessageStream();
  s.accept({ type: "blink-offer", id: "o0", label: "x" });
  s.accept({ type: "blink-offer", id: "o1", action: "save-guide" });
  assert.equal(s.snapshot().length, 0);
  s.accept({
    type: "blink-offer",
    id: "o1",
    label: "儲存導覽",
    action: "save-guide",
  });
  assert.deepEqual(s.snapshot()[0].offer, {
    label: "儲存導覽",
    action: "save-guide",
  });
  s.accept({ type: "blink-say", id: "o1", text: "導覽已儲存" });
  assert.equal(s.snapshot().length, 1);
  assert.equal(s.snapshot()[0].offer, undefined);
});

test("a failure is a plain message with its actions and dismissing removes it", () => {
  const s = createMessageStream();
  const seen = [];
  s.subscribe((state) => seen.push(state.messages.length));
  s.fail({
    id: "guide-failure",
    text: "導覽暫時無法完成，請再試一次。",
    actions: [{ id: "guide-retry", label: "再試一次" }],
  });
  assert.equal(s.snapshot()[0].failure.actions[0].label, "再試一次");
  s.dismiss("guide-failure");
  assert.equal(s.snapshot().length, 0);
  assert.deepEqual(seen, [0, 1, 0]);
  s.dismiss("guide-failure");
  assert.deepEqual(seen, [0, 1, 0], "dismissing nothing tells nobody");
});

test("a new chat empties the history and a second one starts clean", () => {
  const s = createMessageStream();
  s.accept({ type: "sending" });
  s.accept({ type: "delta", id: "a", text: "First chat answer." });
  s.reset();
  assert.equal(s.snapshot().length, 0);
  assert.equal(s.state().speaking, false);
  assert.equal(s.state().working, false);
  s.accept({ type: "delta", id: "b", text: "Second chat answer." });
  assert.equal(s.snapshot().length, 1);
  s.dispose();
});

test("another chat on show clears the list and its own history replays; the chat list is kept", () => {
  const s = createMessageStream();
  const chats = [
    { key: "blink", label: "Blink", live: true },
    { key: "s1", label: "alpha", live: true },
  ];
  s.accept({ type: "chat", key: "blink", channel: false, chats });
  s.accept(say("a", "From Blink."));
  s.accept({ type: "chat", key: "s1", channel: true, chats });
  assert.equal(s.snapshot().length, 0);
  assert.equal(s.state().channel, true);
  assert.equal(s.state().chatKey, "s1");
  s.accept({ ...say("b", "From the terminal."), replay: true });
  assert.deepEqual(
    s.snapshot().map((m) => m.id),
    ["b"],
  );
  // The same chat announced again keeps what it shows.
  s.accept({ type: "chat", key: "s1", channel: true, chats });
  assert.equal(s.snapshot().length, 1);
  s.accept({ type: "chat", key: 5, chats });
  assert.equal(s.state().chatKey, "s1");
});
