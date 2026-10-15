import test from "node:test";
import assert from "node:assert/strict";
import { createGesture } from "./gesture.mjs";

const press = (g, x = 100, y = 100) => g.down({ x, y });

test("a press that stays within 4 px is a click", () => {
  const g = createGesture();
  press(g);
  assert.equal(g.move({ x: 103, y: 100 }), null);
  assert.equal(g.up(), "click");
});

test("a press that moves more than 4 px is a drag and never a click", () => {
  const g = createGesture();
  press(g);
  assert.equal(g.move({ x: 105, y: 100 }), "drag-start");
  assert.equal(g.move({ x: 140, y: 120 }), null, "drag-start fires once");
  assert.equal(g.up(), "drop");
});

test("a small wobble after a drag started still ends as a drop", () => {
  const g = createGesture();
  press(g);
  g.move({ x: 120, y: 100 });
  g.move({ x: 101, y: 100 });
  assert.equal(g.up(), "drop");
});

test("exactly 4 px is a click, past it is a drag", () => {
  const g = createGesture();
  press(g);
  assert.equal(g.move({ x: 104, y: 100 }), null);
  assert.equal(g.up(), "click");
  press(g);
  assert.equal(g.move({ x: 104.5, y: 100 }), "drag-start");
});

test("moves and releases without a press do nothing", () => {
  const g = createGesture();
  assert.equal(g.move({ x: 500, y: 500 }), null);
  assert.equal(g.up(), null);
});

test("cancel ends a press without a click", () => {
  const g = createGesture();
  press(g);
  g.cancel();
  assert.equal(g.up(), null);
});
