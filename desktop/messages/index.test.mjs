import test from "node:test";
import assert from "node:assert/strict";
import { createMessageStream, bubbleParts } from "./index.mjs";

test("streamed sentences retain structure and fenced code", () => {
  const parts = bubbleParts(
    "先看 **摘要**。接著翻譯。\n\n- **重點**：保留格式\n- 第二項\n\n```js\nconst a = 1;\n```",
    true,
  );
  assert.equal(parts.length, 5);
  assert.equal(parts[0].markdown, "先看 **摘要**。");
  assert.equal(parts[1].markdown, "接著翻譯。");
  assert.equal(parts[2].kind, "point");
  assert.equal(parts[4].kind, "code");
  assert.equal(parts[4].code, "const a = 1;");
  assert.equal(
    bubbleParts("Read `a.b()` first. **Keep it. Together.** Then go.", true)
      .length,
    3,
  );
});

test("replay replaces deltas once, history survives turns, status never becomes an answer", () => {
  const s = createMessageStream();
  s.accept({ type: "delta", id: "a", text: "Hello. " });
  s.accept({ type: "delta", id: "a", text: "Next." });
  s.accept({
    type: "message",
    id: "a",
    role: "assistant",
    content: [{ type: "text", text: "Hello. Next." }],
  });
  s.accept({
    type: "message",
    id: "a",
    role: "assistant",
    content: [{ type: "text", text: "Hello. Next." }],
  });
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
  assert.equal(s.bubbles().length, 3);
  assert.equal(s.snapshot()[2].complete, true);
  const copy = s.snapshot();
  copy[0].text = "changed";
  assert.equal(s.snapshot()[0].text, "Hello. Next.");
});

test("mouth activity and quiet fade follow stream, hover revives, disposal removes timers", () => {
  let clock = 0;
  const tasks = new Map();
  const states = [];
  const s = createMessageStream({
    quietMs: 10,
    now: () => clock,
    schedule: (fn) => {
      const id = Symbol();
      tasks.set(id, fn);
      return id;
    },
    cancel: (id) => tasks.delete(id),
  });
  s.subscribe((state) => states.push(state));
  s.accept({ type: "delta", id: "a", text: "你好。" });
  assert.equal(states.at(-1).speaking, true);
  s.accept({ type: "done", turnId: "t" });
  assert.equal(states.at(-1).speaking, false);
  clock = 11;
  for (const f of tasks.values()) f();
  assert.equal(s.state().visible, false);
  s.hover(true);
  assert.equal(s.state().visible, true);
  s.hover(false);
  s.dispose();
  assert.equal(tasks.size, 0);
});

test("long answers expose a chat link without dropping any history", () => {
  const s = createMessageStream({ maxPeekParts: 4 });
  s.accept({
    type: "message",
    id: "long",
    role: "assistant",
    content: [{ type: "text", text: "One. Two. Three. Four. Five. Six." }],
  });
  assert.equal(s.bubbles().length, 7);
  assert.equal(s.bubbles().at(-1).kind, "open-chat");
  s.append({
    id: "code",
    role: "assistant",
    content: [
      { type: "text", text: "```js\n" + "const x = 1;\n".repeat(100) + "```" },
    ],
  });
  assert.equal(s.bubbles().at(-1).messageId, "code");
  assert.equal(s.bubbles().at(-1).kind, "open-chat");
});

test("leaving Blink does not fade a hovered answer surface", () => {
  const tasks = new Map();
  const s = createMessageStream({
    schedule: (fn) => {
      const id = Symbol();
      tasks.set(id, fn);
      return id;
    },
    cancel: (id) => tasks.delete(id),
  });
  s.append({
    id: "a",
    role: "assistant",
    content: [{ type: "text", text: "Read this." }],
  });
  s.hover(true);
  s.hover(true, "bubbles");
  s.hover(false);
  assert.equal(tasks.size, 0);
  assert.equal(s.state().visible, true);
  s.hover(false, "bubbles");
  assert.equal(tasks.size, 1);
  s.dispose();
});

function fakeTimers() {
  let clock = 0,
    next = 0;
  const tasks = new Map();
  return {
    now: () => clock,
    schedule: (fn, ms) => {
      const id = next++;
      tasks.set(id, { at: clock + ms, fn });
      return id;
    },
    cancel: (id) => tasks.delete(id),
    pending: () => tasks.size,
    advance(ms) {
      const end = clock + ms;
      for (;;) {
        const due = [...tasks]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        tasks.delete(due[0]);
        clock = due[1].at;
        due[1].fn();
      }
      clock = end;
    },
  };
}
const say = (id, text) => ({
  type: "message",
  id,
  role: "assistant",
  content: [{ type: "text", text }],
});

test("the first sentence is a bubble as soon as it streams, before the rest exists", () => {
  const s = createMessageStream();
  s.accept({ type: "delta", id: "a", text: "This is a GitHub" });
  assert.deepEqual(
    s.bubbles().map((b) => [b.markdown, b.complete]),
    [["This is a GitHub", false]],
  );
  s.accept({ type: "delta", id: "a", text: " page. It shows" });
  assert.deepEqual(
    s.bubbles().map((b) => [b.markdown, b.complete]),
    [
      ["This is a GitHub page.", true],
      ["It shows", false],
    ],
  );
  assert.equal(s.state().visible, true);
});

test("an answer fades 8 s after the turn is done and a new answer shows alone", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  s.accept({ type: "delta", id: "a", text: "First answer." });
  s.accept({ type: "done", turnId: "t1" });
  t.advance(7999);
  assert.equal(s.state().visible, true);
  t.advance(1);
  assert.equal(s.state().visible, false);
  assert.deepEqual(s.bubbles(), []);
  s.accept({ type: "delta", id: "b", text: "Second answer." });
  assert.deepEqual(
    s.bubbles().map((b) => b.markdown),
    ["Second answer."],
    "an old answer does not come back with the new one",
  );
  assert.equal(s.snapshot().length, 2, "history stays in the chat");
});

test("hover revives only the last answer, and it fades again", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  for (const [id, turn] of [
    ["a", "t1"],
    ["b", "t2"],
  ]) {
    s.accept({
      type: "message",
      id: `u-${id}`,
      role: "user",
      content: [{ type: "text", text: "q" }],
    });
    s.accept({ type: "delta", id, text: `Answer ${id}.` });
    s.accept({ type: "done", turnId: turn });
  }
  t.advance(8000);
  assert.equal(s.state().visible, false);
  s.hover(true);
  assert.equal(s.state().visible, true);
  assert.deepEqual(
    s.bubbles().map((b) => b.markdown),
    ["Answer b."],
  );
  s.hover(false);
  t.advance(8000);
  assert.equal(s.state().visible, false);
});

test("hover is idempotent: repeating it neither notifies nor re-shows", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  s.accept({ type: "delta", id: "a", text: "Hi." });
  s.accept({ type: "done", turnId: "t1" });
  let calls = 0;
  s.subscribe(() => calls++);
  const before = calls;
  for (let i = 0; i < 20; i++) s.hover(true, "bubbles");
  assert.equal(calls, before);
  s.hover(false, "bubbles");
  assert.equal(calls, before);
});

test("replayed history is not an answer: it neither shows nor revives", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  s.accept({ ...say("old", "Yesterday's answer."), replay: true });
  s.accept({ type: "done", turnId: "t0", replay: true });
  assert.equal(s.state().visible, false);
  assert.deepEqual(s.bubbles(), []);
  s.hover(true);
  assert.equal(s.state().visible, false);
  assert.equal(s.snapshot().length, 1, "the chat still has it");
  s.accept(say("new", "Today."));
  assert.deepEqual(
    s.bubbles().map((b) => b.markdown),
    ["Today."],
  );
});

test("a blink-say line is one plain bubble, not split into sentences", () => {
  const s = createMessageStream();
  s.accept({ type: "blink-say", id: "s1", text: "Hi. I am here! Really." });
  assert.deepEqual(
    s.bubbles().map((b) => [b.kind, b.markdown]),
    [["say", "Hi. I am here! Really."]],
  );
  assert.equal(s.state().visible, true);
});

test("a blink-offer is one plain bubble that carries its action", () => {
  const s = createMessageStream();
  s.accept({
    type: "blink-offer",
    id: "o1",
    label: "儲存導覽",
    action: "save-guide",
  });
  assert.deepEqual(
    s.bubbles().map((b) => [b.kind, b.label, b.action]),
    [["offer", "儲存導覽", "save-guide"]],
  );
  assert.equal(s.state().visible, true);
  s.accept({ type: "blink-say", id: "o1", text: "導覽已儲存" });
  assert.deepEqual(
    s.bubbles().map((b) => [b.kind, b.markdown]),
    [["say", "導覽已儲存"]],
    "a later line with the same id replaces the offer",
  );
});

test("a blink-offer without a label or an action is ignored", () => {
  const s = createMessageStream();
  s.accept({ type: "blink-offer", id: "o1", label: "x" });
  s.accept({ type: "blink-offer", id: "o2", action: "save-guide" });
  assert.deepEqual(s.bubbles(), []);
});

test("leaving the display drops the answer and hover elsewhere shows nothing", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  s.accept({ type: "delta", id: "a", text: "Here." });
  s.accept({ type: "done", turnId: "t1" });
  s.leaveDisplay();
  assert.equal(s.state().visible, false);
  s.hover(true);
  assert.equal(s.state().visible, false);
  assert.deepEqual(s.bubbles(), []);
});

test("pinning keeps the answer", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  s.accept({ type: "delta", id: "a", text: "Keep." });
  s.accept({ type: "done", turnId: "t1" });
  s.pin(true);
  t.advance(60_000);
  assert.equal(s.state().visible, true);
  s.pin(false);
  t.advance(8000);
  assert.equal(s.state().visible, false);
});

test("a new chat empties the deck and nothing of the old chat comes back", () => {
  const s = createMessageStream();
  s.accept({ type: "delta", id: "a", text: "First chat answer." });
  s.accept({ type: "done", turnId: "t1" });
  assert.equal(s.state().visible, true);
  s.reset();
  assert.equal(s.state().visible, false);
  assert.deepEqual(s.bubbles(), []);
  s.hover(true);
  assert.equal(
    s.state().visible,
    false,
    "hovering Blink has nothing to bring back",
  );
  s.accept({ type: "delta", id: "b", text: "Second chat answer." });
  assert.equal(s.bubbles().length, 1);
  s.dispose();
});

const failure = {
  id: "guide-failure",
  text: "導覽暫時無法完成，請再試一次。",
  actions: [
    { id: "guide-retry", label: "再試一次" },
    { id: "guide-dismiss", label: "關閉" },
  ],
};

test("a failure is a bubble with its actions and fades on the same settle timer", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  s.fail(failure);
  assert.deepEqual(
    s.bubbles().map((b) => [b.kind, b.markdown, b.actions.map((a) => a.label)]),
    [["failure", failure.text, ["再試一次", "關閉"]]],
  );
  t.advance(7999);
  assert.equal(s.state().visible, true, "readable for the whole settle time");
  t.advance(1);
  assert.equal(s.state().visible, false);
  assert.deepEqual(s.bubbles(), [], "its chips fade with it");
});

test("nothing resurfaces after the fade except through bringBack()", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  let notified = 0;
  s.subscribe(() => notified++);
  s.fail(failure);
  t.advance(8000);
  const settled = notified;
  t.advance(10 * 60 * 1000);
  assert.equal(notified, settled, "minutes later: no change, no resurfacing");
  assert.deepEqual(s.bubbles(), []);
  s.accept({ type: "status", state: "ready" });
  s.accept({ type: "done", turnId: "later" });
  assert.deepEqual(s.bubbles(), [], "unrelated events do not bring it back");
  s.bringBack();
  assert.deepEqual(
    s.bubbles().map((b) => b.id),
    ["guide-failure:0"],
  );
  assert.equal(s.state().visible, true);
  t.advance(8000);
  assert.equal(s.state().visible, false, "and it settles again");
});

test("every bubble kind, failures included, goes with the one settle timer", () => {
  const t = fakeTimers();
  const s = createMessageStream({ ...t, maxPeekParts: 2 });
  s.accept({
    type: "message",
    id: "a",
    role: "assistant",
    complete: true,
    content: [
      {
        type: "text",
        text: "Para.\n\n- point\n\n```js\nlet a;\n```\n\n# Head\n\nMore. Even more.",
      },
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "AA==" },
      },
    ],
  });
  s.accept({ type: "blink-say", id: "say", text: "Plain line" });
  s.fail(failure);
  const kinds = new Set(s.bubbles().map((b) => b.kind));
  for (const kind of [
    "sentence",
    "point",
    "code",
    "heading",
    "image",
    "open-chat",
    "say",
    "failure",
  ])
    assert.ok(kinds.has(kind), `${kind} is on the deck`);
  t.advance(7999);
  assert.ok(s.bubbles().length > 0);
  t.advance(1);
  assert.deepEqual(s.bubbles(), []);
  assert.equal(t.pending(), 0, "no second timer is left running");
});

test("the pointer on a failure holds it; leaving hands the timer back", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  s.fail(failure);
  s.hover(true, "bubbles");
  t.advance(60_000);
  assert.equal(s.state().visible, true);
  s.hover(false, "bubbles");
  t.advance(8000);
  assert.equal(s.state().visible, false);
});

test("dismissing a failure removes it for good, even from bringBack()", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  s.accept({ type: "delta", id: "a", text: "Earlier answer." });
  s.accept({ type: "done", turnId: "t1" });
  t.advance(8000);
  s.fail(failure);
  s.dismiss("guide-failure");
  assert.deepEqual(s.bubbles(), []);
  t.advance(8000);
  s.bringBack();
  assert.ok(
    s.bubbles().every((b) => b.kind !== "failure"),
    "the dismissed failure is gone",
  );
  assert.deepEqual(
    s.bubbles().map((b) => b.markdown),
    ["Earlier answer."],
    "the answer before it is still what hovering recalls",
  );
});

test("onSettle tells marks when the deck fades, and stops when unsubscribed", () => {
  const t = fakeTimers();
  const s = createMessageStream(t);
  const seen = [];
  const off = s.onSettle((event) => seen.push(event));
  s.accept({ type: "delta", id: "a", text: "Answer." });
  s.accept({ type: "done", turnId: "t1" });
  assert.deepEqual(seen, []);
  t.advance(8000);
  assert.deepEqual(seen, [{ turnId: "t1" }]);
  off();
  s.fail(failure);
  t.advance(8000);
  assert.equal(seen.length, 1);
});
