import test from "node:test";
import assert from "node:assert/strict";
import { createDwell } from "./dwell.mjs";
import { timing } from "../shared/motion.mjs";

const run = (dwell, steps) =>
  steps.map(([over, now]) => dwell.update(over, now));

test("the rest is the shared 300 ms", () => {
  assert.equal(timing.menuRest, 300);
});

test("the fan opens only after the pointer rested 300 ms", () => {
  const dwell = createDwell();
  assert.deepEqual(
    run(dwell, [
      [true, 1000],
      [true, 1100],
      [true, 1299],
      [true, 1300],
      [true, 1500],
    ]),
    [false, false, false, true, true],
  );
});

test("a 200 ms pass-by never opens it", () => {
  const dwell = createDwell();
  const seen = [];
  for (let t = 0; t <= 200; t += 16) seen.push(dwell.update(true, 500 + t));
  for (let t = 216; t <= 1000; t += 16) seen.push(dwell.update(false, 500 + t));
  assert.equal(seen.some(Boolean), false);
});

test("leaving closes it at once and the next visit starts a new rest", () => {
  const dwell = createDwell();
  dwell.update(true, 0);
  assert.equal(dwell.update(true, 400), true);
  assert.equal(dwell.update(false, 410), false);
  assert.equal(dwell.update(true, 420), false, "the old rest does not count");
  assert.equal(dwell.update(true, 700), false);
  assert.equal(dwell.update(true, 720), true);
});

test("a flicker of the pointer restarts the rest", () => {
  const dwell = createDwell();
  dwell.update(true, 0);
  dwell.update(true, 250);
  dwell.update(false, 260);
  assert.equal(dwell.update(true, 270), false);
  assert.equal(dwell.update(true, 560), false);
  assert.equal(dwell.update(true, 570), true);
});
