import test from "node:test";
import assert from "node:assert/strict";
import { createCharacterState } from "./state.mjs";
test("hover retreats only after 1.5 seconds and re-entry cancels retreat", () => {
  const state = createCharacterState();
  state.hover(true, 0);
  assert.equal(state.read(0).mode, "hover");
  state.hover(false, 100);
  assert.equal(state.read(1599).mode, "hover");
  state.hover(true, 1550);
  assert.equal(state.read(3000).mode, "hover");
  state.hover(false, 3000);
  assert.equal(state.read(4500).mode, "peek");
});
test("drag and pin prevent dismissal; default is unpinned; unpin resumes retreat", () => {
  const state = createCharacterState();
  assert.equal(state.read(0).pinned, false);
  state.drag(true, 0);
  state.hover(false, 1);
  assert.equal(state.read(5000).mode, "drag");
  state.drag(false, 5000);
  assert.equal(state.read(5000).mode, "drop");
  state.pin(true, 5000);
  assert.equal(state.read(9000).mode, "hover");
  state.pin(false, 9000);
  assert.equal(state.read(10500).mode, "peek");
});
test("release bounces into the edge peek; repeated state broadcasts do not restart it", () => {
  const state = createCharacterState();
  state.hover(true, 0);
  state.drag(true, 10);
  state.drag(false, 100);
  state.drag(false, 600);
  state.pin(false, 600);
  assert.equal(state.read(749).mode, "drop");
  assert.equal(state.read(750).mode, "peek");
  state.hover(true, 800);
  assert.equal(state.read(800).mode, "hover");
});
