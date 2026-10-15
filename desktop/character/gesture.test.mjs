import test from "node:test";
import assert from "node:assert/strict";
import { createGesture, DRAG_SLOP } from "./gesture.mjs";

test("a press that does not move is a click", () => {
  const g = createGesture();
  assert.equal(g.down({ x: 100, y: 100 }), true);
  assert.equal(g.state, "pressed");
  assert.equal(g.move({ x: 100, y: 100 }), null);
  assert.deepEqual(g.up(), { type: "click" });
  assert.equal(g.state, "idle");
});

test("moving up to the slop is still a click, past it is a drag", () => {
  assert.equal(DRAG_SLOP, 4);
  const inside = createGesture();
  inside.down({ x: 0, y: 0 });
  assert.equal(inside.move({ x: 2.8, y: 2.8 }), null);
  assert.equal(inside.move({ x: 4, y: 0 }), null, "exactly 4 px is not more");
  assert.deepEqual(inside.up(), { type: "click" });
  const past = createGesture();
  past.down({ x: 0, y: 0 });
  assert.deepEqual(past.move({ x: 4.5, y: 0 }), { type: "drag-start" });
  assert.equal(past.state, "dragging");
});

test("once a press became a drag it is never a click, even back at the start", () => {
  const g = createGesture();
  g.down({ x: 50, y: 50 });
  assert.deepEqual(g.move({ x: 80, y: 50 }), { type: "drag-start" });
  assert.equal(g.move({ x: 50, y: 50 }), null);
  assert.deepEqual(g.up(), { type: "drop" });
});

test("a drag starts only once", () => {
  const g = createGesture();
  g.down({ x: 0, y: 0 });
  assert.deepEqual(g.move({ x: 10, y: 0 }), { type: "drag-start" });
  assert.equal(g.move({ x: 20, y: 0 }), null);
  assert.equal(g.move({ x: 30, y: 0 }), null);
});

test("a cancelled press is neither a click nor a drop; a cancelled drag drops", () => {
  const press = createGesture();
  press.down({ x: 0, y: 0 });
  assert.equal(press.cancel(), null);
  assert.equal(press.state, "idle");
  const drag = createGesture();
  drag.down({ x: 0, y: 0 });
  drag.move({ x: 30, y: 0 });
  assert.deepEqual(drag.cancel(), { type: "drop" });
  assert.equal(drag.state, "idle");
});

test("moves and releases without a press do nothing, and a second press while held is ignored", () => {
  const g = createGesture();
  assert.equal(g.move({ x: 90, y: 90 }), null);
  assert.equal(g.up(), null);
  assert.equal(g.down({ x: 1, y: 1 }), true);
  assert.equal(g.down({ x: 500, y: 500 }), false);
  assert.equal(
    g.move({ x: 2, y: 2 }),
    null,
    "distance is from the first press",
  );
  assert.deepEqual(g.up(), { type: "click" });
});

test("a custom slop is honoured and the gesture is reusable", () => {
  const g = createGesture({ slop: 10 });
  g.down({ x: 0, y: 0 });
  assert.equal(g.move({ x: 9, y: 0 }), null);
  assert.deepEqual(g.move({ x: 11, y: 0 }), { type: "drag-start" });
  g.up();
  g.down({ x: 0, y: 0 });
  assert.deepEqual(g.up(), { type: "click" });
});
