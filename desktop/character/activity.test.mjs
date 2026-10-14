import test from "node:test";
import assert from "node:assert/strict";
import { createActivityState } from "./activity.mjs";

test("connection and turn events drive readable session expressions", () => {
  const state = createActivityState();
  assert.deepEqual(state.read(0), {
    expression: "idle",
    connection: "starting",
    talking: false,
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
