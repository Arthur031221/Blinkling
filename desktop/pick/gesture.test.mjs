import test from "node:test";
import assert from "node:assert/strict";
import { createGesture, DRAG_THRESHOLD, rectBetween } from "./gesture.mjs";

test("drag threshold is about 6 px", () => assert.equal(DRAG_THRESHOLD, 6));

test("press and release within 6 px is a click at the press point", () => {
  const g = createGesture();
  g.down({ x: 100, y: 100 });
  assert.equal(g.move({ x: 103, y: 104 }).phase, "pressed");
  assert.deepEqual(g.up({ x: 103, y: 104 }), {
    type: "click",
    point: { x: 100, y: 100 },
  });
});

test("moving past 6 px starts an area drag with a normalized rectangle", () => {
  const g = createGesture();
  g.down({ x: 100, y: 100 });
  const state = g.move({ x: 80, y: 60 });
  assert.equal(state.phase, "dragging");
  assert.deepEqual(state.rect, { x: 80, y: 60, width: 20, height: 40 });
  assert.deepEqual(g.up({ x: 80, y: 60 }), {
    type: "area",
    rect: { x: 80, y: 60, width: 20, height: 40 },
  });
});

test("once dragging, coming back near the start still takes an area", () => {
  const g = createGesture();
  g.down({ x: 10, y: 10 });
  g.move({ x: 60, y: 10 });
  g.move({ x: 11, y: 10 });
  assert.equal(g.up({ x: 11, y: 10 }).type, "area");
});

test("a drag that collapses to nothing is cancelled, not a click", () => {
  const g = createGesture();
  g.down({ x: 10, y: 10 });
  g.move({ x: 30, y: 30 });
  assert.equal(g.up({ x: 10, y: 10 }), null);
});

test("cancel resets the gesture", () => {
  const g = createGesture();
  g.down({ x: 1, y: 1 });
  g.cancel();
  assert.equal(g.state().phase, "idle");
  assert.equal(g.up({ x: 1, y: 1 }), null);
});

test("the area is clamped to the bounds it is given", () => {
  const g = createGesture({ bounds: { x: 0, y: 0, width: 200, height: 100 } });
  g.down({ x: 150, y: 50 });
  g.move({ x: 400, y: 300 });
  assert.deepEqual(g.up({ x: 400, y: 300 }).rect, {
    x: 150,
    y: 50,
    width: 50,
    height: 50,
  });
});

test("a dragging state names the press point, so the layer can redraw the band from its own pointer", () => {
  const g = createGesture();
  g.down({ x: 100, y: 100 });
  assert.equal(g.move({ x: 103, y: 100 }).from, null);
  assert.deepEqual(g.move({ x: 80, y: 60 }).from, { x: 100, y: 100 });
});

test("rectBetween normalizes any two corners", () => {
  assert.deepEqual(rectBetween({ x: 100, y: 100 }, { x: 80, y: 130 }), {
    x: 80,
    y: 100,
    width: 20,
    height: 30,
  });
});
