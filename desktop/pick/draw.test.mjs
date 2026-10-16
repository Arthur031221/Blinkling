import test from "node:test";
import assert from "node:assert/strict";
import {
  strokeProgress,
  partial,
  polylineLength,
  effectDone,
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
