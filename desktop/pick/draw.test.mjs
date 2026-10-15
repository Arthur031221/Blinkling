import test from "node:test";
import assert from "node:assert/strict";
import {
  strokeProgress,
  partial,
  polylineLength,
  effectDone,
  pointAlong,
  spotTrail,
} from "./draw.mjs";

const line = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
];

test("a stroke waits for its start, runs for its duration, then stays done", () => {
  const stroke = { at: 100, duration: 200 };
  assert.equal(strokeProgress(stroke, 0), 0);
  assert.equal(strokeProgress(stroke, 100), 0);
  assert.equal(strokeProgress(stroke, 200), 0.5);
  assert.equal(strokeProgress(stroke, 300), 1);
  assert.equal(strokeProgress(stroke, 9999), 1);
});

test("an easing shapes the progress but not its ends", () => {
  const stroke = { at: 0, duration: 100 };
  const square = (x) => x * x;
  assert.equal(strokeProgress(stroke, 50, square), 0.25);
  assert.equal(strokeProgress(stroke, 0, square), 0);
  assert.equal(strokeProgress(stroke, 100, square), 1);
});

test("a zero duration stroke is all there from its start", () => {
  assert.equal(strokeProgress({ at: 10, duration: 0 }, 9), 0);
  assert.equal(strokeProgress({ at: 10, duration: 0 }, 10), 1);
});

test("partial draws up to a share of the length and ends mid segment", () => {
  assert.equal(polylineLength(line), 20);
  assert.deepEqual(partial(line, 0.25), [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ]);
  assert.deepEqual(partial(line, 0.75), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ]);
  assert.deepEqual(partial(line, 1), line);
  assert.deepEqual(partial(line, 0), []);
});

test("an effect is done when its total has passed", () => {
  assert.equal(effectDone({ total: 320 }, 319), false);
  assert.equal(effectDone({ total: 320 }, 320), true);
});

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
  { x: 0, y: 0 },
];

test("pointAlong walks a polyline by share of its length", () => {
  assert.deepEqual(pointAlong(square, 0), { x: 0, y: 0 });
  assert.deepEqual(pointAlong(square, 0.125), { x: 5, y: 0 });
  assert.deepEqual(pointAlong(square, 0.5), { x: 10, y: 10 });
  assert.deepEqual(pointAlong(square, 2), { x: 0, y: 0 });
});

test("the spot runs clockwise round a border and wraps after one lap", () => {
  const at = (ms) => {
    const { x, y } = spotTrail(square, ms, { period: 1000 }).head;
    return { x, y };
  };
  assert.deepEqual(at(125), { x: 5, y: 0 });
  // Clockwise on screen: along the top to the right, then down the right side.
  assert.ok(at(250).x > at(125).x);
  assert.ok(at(375).y > 0 && at(375).x === 10);
  assert.deepEqual(at(1125), at(125));
  assert.equal(spotTrail(square, -1, { period: 1000 }), null);
});

test("the spot's tail trails behind the head and fades", () => {
  const { head, trail } = spotTrail(square, 250, {
    period: 1000,
    tail: 0.1,
    steps: 4,
  });
  assert.equal(trail.length, 5);
  assert.deepEqual(trail[0], head);
  assert.ok(trail[1].x < head.x, "behind the head on the top edge");
  for (let i = 1; i < trail.length; i++)
    assert.ok(trail[i].fade < trail[i - 1].fade);
  const wrapped = spotTrail(square, 20, { period: 1000, tail: 0.1 });
  assert.ok(wrapped.trail.every((p) => Number.isFinite(p.x + p.y)));
});
