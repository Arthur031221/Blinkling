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
