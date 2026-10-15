import test from "node:test";
import assert from "node:assert/strict";
import {
  flightPath,
  pathAt,
  cubicBezier,
  genieColumns,
  genieSize,
  startAngle,
  turnedSize,
} from "./flight.mjs";
import { stepSpring, settled } from "./spring.mjs";
import { easing, springs } from "../shared/motion.mjs";

const from = { x: 200, y: 200, width: 300, height: 100 };
const to = { x: 1250, y: 700 };

test("the path starts on the picked element and ends in Blink", () => {
  const path = flightPath({ from, to });
  const start = pathAt(path, 0);
  const end = pathAt(path, 1);
  assert.deepEqual([start.x, start.y], [350, 250]);
  assert.deepEqual([end.x, end.y], [1250, 700]);
});

test("the path is an arc, not the straight line", () => {
  const path = flightPath({ from, to });
  const mid = pathAt(path, 0.5);
  const chord = { x: (350 + 1250) / 2, y: (250 + 700) / 2 };
  const off = Math.hypot(mid.x - chord.x, mid.y - chord.y);
  assert.ok(off > 30, `arc bulge ${off}`);
});

test("the arc bows upward, away from the desktop floor", () => {
  const path = flightPath({ from, to });
  const mid = pathAt(path, 0.5);
  assert.ok(mid.y < (250 + 700) / 2);
});

test("the position moves monotonically toward Blink", () => {
  const path = flightPath({ from, to });
  let last = -Infinity;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const p = pathAt(path, Math.min(1, t));
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

const genie = (p, turned = { width: 160, height: 100 }) =>
  genieColumns(flightPath({ from, to }), turned, p, { count: 8 });

test("a pick is sucked in at its own size, down to a cap", () => {
  assert.deepEqual(genieSize({ x: 0, y: 0, width: 200, height: 100 }), {
    width: 200,
    height: 100,
  });
  const big = genieSize({ x: 0, y: 0, width: 1800, height: 900 });
  assert.ok(big.width <= 360 && big.height <= 180);
  assert.ok(Math.abs(big.width / big.height - 2) < 0.05);
});

test("turning the picture to the path keeps its area and swaps a quarter turn", () => {
  const quarter = turnedSize({ width: 200, height: 100 }, Math.PI / 2);
  assert.ok(Math.abs(quarter.width - 100) < 1e-9);
  assert.ok(Math.abs(quarter.height - 200) < 1e-9);
  const path = flightPath({ from, to });
  assert.ok(Math.abs(startAngle(path)) < Math.PI);
});

test("at rest the columns sit side by side, whole and unstretched", () => {
  const columns = genie(0);
  assert.equal(columns.length, 8);
  for (const c of columns) {
    assert.ok(Math.abs(c.height - 100) < 1e-9);
    assert.ok(c.length >= c.sourceWidth && c.length < c.sourceWidth + 2);
    assert.equal(c.alpha, 1);
  }
  const centre = columns.reduce((s, c) => s + c.x, 0) / 8;
  assert.ok(Math.abs(centre - 350) < 1, `centred on the pick: ${centre}`);
});

test("the end nearest the mouth is pulled in first and the picture stretches", () => {
  const columns = genie(0.4);
  const reach = (c) => Math.hypot(c.x - to.x, c.y - to.y);
  for (let i = 1; i < columns.length; i++)
    assert.ok(reach(columns[i]) <= reach(columns[i - 1]) + 1e-6, `column ${i}`);
  const span = Math.hypot(
    columns[7].x - columns[0].x,
    columns[7].y - columns[0].y,
  );
  assert.ok(span > 160, `stretched to ${span.toFixed(0)}`);
  const leading = columns[7];
  assert.ok(leading.height < columns[0].height, "narrower near the mouth");
});

test("at the end every column is a sliver on the mouth, fading out", () => {
  for (const c of genie(1)) {
    assert.ok(Math.abs(c.x - to.x) < 1e-6 && Math.abs(c.y - to.y) < 1e-6);
    assert.ok(c.height <= 100 * 0.05);
    assert.ok(c.alpha < 1e-9);
  }
});

test("no column is ever missing or not a number", () => {
  for (let p = 0; p <= 1.0001; p += 0.05)
    for (const c of genie(Math.min(1, p)))
      for (const v of [c.x, c.y, c.angle, c.height, c.length, c.alpha])
        assert.ok(Number.isFinite(v));
});
