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

test("read returns the face from the one table, with watching passed in", () => {
  const state = createActivityState();
  assert.equal(state.read(0).face, "idle");
  assert.equal(state.read(0, { watching: true }).face, "watching");
  state.accept({ type: "message", role: "user" }, 5);
  assert.equal(state.read(5, { watching: true }).face, "thinking");
  state.accept({ type: "delta" }, 10);
  assert.equal(state.read(10, { watching: true }).face, "talking");
  state.accept({ type: "done" }, 20);
  assert.equal(state.read(20).face, "idle");
});

test("sending shows the thinking face at once, before the session echoes", () => {
  const state = createActivityState();
  state.accept({ type: "sending" }, 0);
  assert.equal(state.read(1).face, "thinking");
  assert.equal(state.read(1).talking, false);
});

test("permission, error, a usage limit and a lock each take the face by priority", () => {
  const state = createActivityState();
  state.accept({ type: "message", role: "user" }, 0);
  state.accept({ type: "usage-limit", resetAt: "2026-10-15T20:00:00Z" }, 1);
  assert.equal(state.read(1).face, "usage-limit");
  assert.deepEqual(state.read(1).detail, { resetAt: "2026-10-15T20:00:00Z" });
  state.accept({ type: "activity", state: "permission" }, 2);
  assert.equal(state.read(2).face, "permission");
  state.accept({ type: "guard", locked: true }, 3);
  assert.equal(state.read(3).face, "lock");
  assert.deepEqual(state.read(3).detail, {});
  state.accept({ type: "guard", locked: false }, 4);
  assert.equal(state.read(4).face, "permission");
  state.accept({ type: "activity", state: "thinking" }, 5);
  assert.equal(state.read(5).face, "usage-limit");
  state.accept({ type: "usage-limit", resetAt: null }, 6);
  assert.equal(state.read(6).face, "thinking");
  state.accept({ type: "status", state: "blocked" }, 7);
  assert.equal(state.read(7).face, "error");
});

test("malformed guard and usage-limit events change nothing", () => {
  const state = createActivityState();
  state.accept({ type: "guard" }, 0);
  state.accept({ type: "guard", locked: "yes" }, 0);
  state.accept({ type: "usage-limit", resetAt: {} }, 0);
  assert.equal(state.read(0).face, "idle");
});
