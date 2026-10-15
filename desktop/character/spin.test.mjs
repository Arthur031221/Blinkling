import test from "node:test";
import assert from "node:assert/strict";
import { createSpinDetector } from "./spin.mjs";

/** `turns` full circles of radius `r`, one point every 16 ms, `ms` per circle. */
function circle(
  detector,
  turns,
  { r = 80, ms = 1000, start = 0, dir = 1 } = {},
) {
  const count = Math.round((turns * ms) / 16);
  let at = start;
  for (let i = 0; i <= count; i++) {
    at = start + i * 16;
    const a = dir * ((i * 16) / ms) * Math.PI * 2;
    detector.add({ x: 400 + r * Math.cos(a), y: 300 + r * Math.sin(a) }, at);
  }
  return at;
}

test("two full circles make Blink dizzy, in either direction", () => {
  for (const dir of [1, -1]) {
    const d = createSpinDetector();
    circle(d, 2.2, { dir });
    assert.equal(d.dizzy, true, `dir ${dir}`);
  }
});

test("one circle does not", () => {
  const d = createSpinDetector();
  circle(d, 1.2);
  assert.equal(d.dizzy, false);
});

test("a long straight drag never adds up", () => {
  const d = createSpinDetector();
  for (let i = 0; i < 400; i++) d.add({ x: i * 6, y: 100 + (i % 3) }, i * 16);
  assert.equal(d.dizzy, false);
});

test("shaking back and forth does not count as circles", () => {
  const d = createSpinDetector();
  for (let i = 0; i < 400; i++)
    d.add({ x: 400 + Math.sin(i / 4) * 120, y: 300 }, i * 16);
  assert.equal(d.dizzy, false);
});

test("a tiny wobble is not a circle", () => {
  const d = createSpinDetector();
  circle(d, 6, { r: 8, ms: 400 });
  assert.equal(d.dizzy, false);
});

test("circles spread over too long do not add up", () => {
  const d = createSpinDetector();
  circle(d, 2.2, { ms: 6000 });
  assert.equal(d.dizzy, false);
});

test("reset forgets the turns", () => {
  const d = createSpinDetector();
  circle(d, 2.5);
  d.reset();
  assert.equal(d.dizzy, false);
});
