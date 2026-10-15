import test from "node:test";
import assert from "node:assert/strict";
import { createActivityState } from "./activity.mjs";

test("connection and turn events drive readable session expressions", () => {
  const state = createActivityState();
  assert.deepEqual(state.read(0), {
    expression: "idle",
    connection: "starting",
    talking: false,
    face: "idle",
    detail: {},
    dot: null,
  });
  state.accept({ type: "status", state: "connected" }, 0);
  state.accept({ type: "message", role: "user" }, 10);
  assert.equal(state.read(10).expression, "thinking");
  state.accept({ type: "delta" }, 20);
  assert.equal(state.read(20).talking, true);
  state.accept({ type: "done" }, 30);
  assert.equal(state.read(30).expression, "finished");
  assert.equal(state.read(30).talking, false);
  assert.equal(state.read(830).expression, "idle");
  state.accept({ type: "status", state: "retrying" }, 900);
  assert.equal(state.read(900).connection, "retrying");
  assert.equal(state.read(900).expression, "idle");
});

test("permission and errors survive connection changes until an explicit activity", () => {
  const state = createActivityState();
  state.accept({ type: "activity", state: "permission" }, 0);
  state.accept({ type: "status", state: "retrying" }, 10);
  assert.equal(state.read(10).expression, "permission");
  state.accept({ type: "activity", state: "error" }, 20);
  assert.equal(state.read(20).expression, "error");
  state.accept({ type: "status", state: "connected" }, 30);
  assert.equal(state.read(30).expression, "error");
  state.accept({ type: "activity", state: "idle" }, 40);
  assert.equal(state.read(40).expression, "idle");
  state.accept({ type: "status", state: "blocked" }, 50);
  assert.equal(state.read(50).expression, "error");
  state.accept({ type: "activity", state: "invalid" }, 60);
  assert.equal(state.read(60).expression, "error");
});

const fresh = (wall = 0) => createActivityState({ wall: () => wall });

test("sending shows the thinking face at once, before the session echoes the turn", () => {
  const state = fresh();
  state.accept({ type: "status", state: "connected" }, 0);
  state.accept({ type: "sending" }, 1000);
  assert.equal(state.read(1000).face, "thinking");
  state.accept({ type: "message", role: "user" }, 1400);
  assert.equal(state.read(1400).face, "thinking");
});

test("the first streamed text turns thinking into talking, and the end back to idle", () => {
  const state = fresh();
  state.accept({ type: "sending" }, 0);
  state.accept({ type: "delta" }, 50);
  assert.equal(state.read(50).face, "talking");
  assert.equal(state.read(50).talking, true);
  state.accept({ type: "done" }, 60);
  assert.equal(state.read(860).face, "idle");
});

test("a guard event locks Blink until it is released", () => {
  const state = fresh();
  state.accept({ type: "guard", lock: true }, 0);
  assert.equal(state.read(0).face, "lock");
  state.accept({ type: "sending" }, 10);
  assert.equal(state.read(10).face, "lock", "lock outranks thinking");
  state.accept({ type: "guard", lock: false }, 20);
  assert.equal(state.read(20).face, "thinking");
});

test("auto explain on shows the watching face, below everything else", () => {
  const state = fresh();
  state.accept({ type: "watching", on: true }, 0);
  assert.equal(state.read(0).face, "watching");
  state.accept({ type: "delta" }, 10);
  assert.equal(state.read(10).face, "talking");
  state.accept({ type: "done" }, 20);
  assert.equal(state.read(900).face, "watching");
  state.accept({ type: "watching", on: false }, 1000);
  assert.equal(state.read(1000).face, "idle");
});

test("usage limit keeps its reset time and ends by itself at that time", () => {
  let wall = 1_000;
  const state = createActivityState({ wall: () => wall });
  state.accept({ type: "usage-limit", resetAt: 5_000 }, 0);
  assert.deepEqual(state.read(0).detail, { resetAt: 5_000 });
  assert.equal(state.read(0).face, "usage-limit");
  assert.equal(state.read(0).expression, "idle", "never drawn as an error");
  wall = 5_000;
  assert.equal(state.read(1).face, "idle");
});

test("usage limit can be cleared by an event and outranks an error", () => {
  const state = fresh();
  state.accept({ type: "activity", state: "error" }, 0);
  state.accept({ type: "usage-limit", resetAt: 9e12 }, 1);
  assert.equal(state.read(1).face, "usage-limit");
  state.accept({ type: "usage-limit", resetAt: null }, 2);
  assert.equal(state.read(2).face, "error");
});

test("permission outranks a usage limit", () => {
  const state = fresh();
  state.accept({ type: "usage-limit", resetAt: 9e12 }, 0);
  state.accept({ type: "activity", state: "permission" }, 1);
  assert.equal(state.read(1).face, "permission");
});

test("the connection dot shows only for reconnecting and disconnected", () => {
  const state = fresh();
  assert.equal(state.read(0).dot, null, "starting is not a fault");
  state.accept({ type: "status", state: "connected" }, 0);
  assert.equal(state.read(0).dot, null);
  state.accept({ type: "status", state: "retrying" }, 1);
  assert.equal(state.read(1).dot, "retrying");
  state.accept({ type: "status", state: "connected" }, 2);
  assert.equal(state.read(2).dot, null);
  state.accept({ type: "status", state: "blocked" }, 3);
  assert.equal(state.read(3).dot, "blocked");
});

test("a usage limit with no reset time lasts until it is cleared", () => {
  const state = fresh(9e15);
  state.accept({ type: "usage-limit" }, 0);
  assert.equal(state.read(0).face, "usage-limit");
  assert.deepEqual(state.read(0).detail, { resetAt: null });
  state.accept({ type: "usage-limit", resetAt: null }, 1);
  assert.equal(state.read(1).face, "idle");
});
