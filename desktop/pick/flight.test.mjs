import test from "node:test";
import assert from "node:assert/strict";
import { flightPath, flightAt, cubicBezier, thumbnailSize } from "./flight.mjs";
import { stepSpring, settled } from "./spring.mjs";
import { easing, springs } from "../shared/motion.mjs";

const from = { x: 200, y: 200, width: 300, height: 100 };
const to = { x: 1250, y: 700 };

test("the thumbnail is capped and keeps the aspect ratio", () => {
  const s = thumbnailSize(from);
  assert.ok(s.width <= 96 && s.height <= 96);
  assert.ok(Math.abs(s.width / s.height - 3) < 0.05);
  const tiny = thumbnailSize({ x: 0, y: 0, width: 20, height: 10 });
  assert.ok(tiny.width >= 20);
});

test("the path starts on the picked element and ends in Blink", () => {
  const path = flightPath({ from, to });
  const start = flightAt(path, 0);
  const end = flightAt(path, 1);
  assert.deepEqual([start.x, start.y], [350, 250]);
  assert.deepEqual([end.x, end.y], [1250, 700]);
  assert.equal(start.scale, 1);
  assert.ok(end.scale < 0.5);
});

test("the path is an arc, not the straight line", () => {
  const path = flightPath({ from, to });
  const mid = flightAt(path, 0.5);
  const chord = { x: (350 + 1250) / 2, y: (250 + 700) / 2 };
  const off = Math.hypot(mid.x - chord.x, mid.y - chord.y);
  assert.ok(off > 30, `arc bulge ${off}`);
});

test("the arc bows upward, away from the desktop floor", () => {
  const path = flightPath({ from, to });
  const mid = flightAt(path, 0.5);
  assert.ok(mid.y < (250 + 700) / 2);
});

test("the position moves monotonically toward Blink", () => {
  const path = flightPath({ from, to });
  let last = -Infinity;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const p = flightAt(path, Math.min(1, t));
    assert.ok(p.x >= last - 1e-6);
    last = p.x;
  }
});

test("cubic-bezier parses the shared easing tokens and is monotonic 0 to 1", () => {
  for (const curve of Object.values(easing)) {
    const f = cubicBezier(curve);
    assert.ok(Math.abs(f(0)) < 1e-6 && Math.abs(f(1) - 1) < 1e-6);
    let last = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const y = f(t);
      assert.ok(y >= last - 1e-9);
      last = y;
    }
  }
  assert.throws(() => cubicBezier("linear"));
});

test("a critically damped spring settles without overshoot, in under 450 ms", () => {
  let state = { value: 0, velocity: 0 };
  let t = 0;
  let max = 0;
  while (!settled(state, 1) && t < 2000) {
    state = stepSpring(state, 1, springs.crisp, 1 / 60);
    max = Math.max(max, state.value);
    t += 1000 / 60;
  }
  assert.ok(max <= 1.0001, `overshoot ${max}`);
  assert.ok(t <= 450, `settled after ${t} ms`);
});

test("a spring can be reversed from where it is now", () => {
  let state = { value: 0, velocity: 0 };
  for (let i = 0; i < 6; i++)
    state = stepSpring(state, 1, springs.crisp, 1 / 60);
  const mid = state.value;
  assert.ok(mid > 0.1 && mid < 0.99);
  const next = stepSpring(state, 0, springs.crisp, 1 / 60);
  assert.ok(Math.abs(next.value - mid) < 0.2, "no jump");
});

test("the spring is stable for a long frame", () => {
  const next = stepSpring({ value: 0, velocity: 0 }, 1, springs.crisp, 0.5);
  assert.ok(next.value > 0.9 && next.value <= 1);
});
