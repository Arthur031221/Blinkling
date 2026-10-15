import test from "node:test";
import assert from "node:assert/strict";
import { createGrouper } from "./group.mjs";

function fake() {
  let now = 1_000_000;
  let n = 0;
  const g = createGrouper({ clock: () => now, uuid: () => `chat-${++n}` });
  return { g, wait: (s) => (now += s * 1000) };
}

test("the first pick starts a chat", () => {
  const { g } = fake();
  assert.deepEqual(g.join(), { chatId: "chat-1", fresh: true });
});

test("59 s later joins the same chat", () => {
  const { g, wait } = fake();
  g.join();
  wait(59);
  assert.deepEqual(g.join(), { chatId: "chat-1", fresh: false });
});

test("61 s later starts a new chat", () => {
  const { g, wait } = fake();
  g.join();
  wait(61);
  assert.deepEqual(g.join(), { chatId: "chat-2", fresh: true });
});

test("the window slides: each pick extends it", () => {
  const { g, wait } = fake();
  g.join();
  wait(50);
  g.join();
  wait(50);
  assert.equal(g.join().fresh, false);
});

test("exactly 60 s still joins", () => {
  const { g, wait } = fake();
  g.join();
  wait(60);
  assert.equal(g.join().fresh, false);
});

test("reset forgets the chat", () => {
  const { g } = fake();
  g.join();
  g.reset();
  assert.equal(g.join().fresh, true);
  assert.equal(g.current(), "chat-2");
});

test("peek tells whether a chat is open without extending it", () => {
  const { g, wait } = fake();
  assert.equal(g.peek(), null);
  g.join();
  wait(30);
  assert.equal(g.peek(), "chat-1");
  wait(40);
  assert.equal(g.peek(), null);
});
