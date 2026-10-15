import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { flightPath, flightKeyframes, FLIGHT_MS, thumbSize } from "./flight.mjs";
import { duration } from "../shared/motion.mjs";

const from = { x: 200, y: 300, width: 300, height: 100 };
const to = { x: 1800, y: 900 };

test("the flight starts on the picked thing and ends in Blink", () => {
  const path = flightPath(from, to);
  const start = path.at(0);
  const end = path.at(1);
  assert.deepEqual([start.x, start.y], [350, 350]);
  assert.deepEqual([Math.round(end.x), Math.round(end.y)], [1800, 900]);
});

test("the path is an arc: the midpoint is lifted above the straight line", () => {
  const path = flightPath(from, to);
  const mid = path.at(0.5);
  const straightY = (350 + 900) / 2;
  assert.ok(mid.y < straightY - 20, `mid ${mid.y} vs ${straightY}`);
});

test("the thumbnail shrinks along the way and is small on arrival", () => {
  const path = flightPath(from, to);
  assert.equal(path.at(0).scale, 1);
  assert.ok(path.at(1).scale < 0.3);
  let last = 2;
  for (let t = 0; t <= 1; t += 0.1) {
    const s = path.at(t).scale;
    assert.ok(s <= last + 1e-9);
    last = s;
  }
});

test("keyframes are transform and opacity only, with offsets spanning 0 to 1", () => {
  const frames = flightKeyframes(flightPath(from, to), 12);
  assert.equal(frames.length, 13);
  assert.equal(frames[0].offset, 0);
  assert.equal(frames.at(-1).offset, 1);
  for (const f of frames) {
    assert.deepEqual(Object.keys(f).sort(), ["offset", "opacity", "transform"]);
    assert.match(f.transform, /^translate3d\(.*\) scale\(.*\)$/);
  }
  assert.ok(frames.at(-1).opacity < 1, "fades into Blink's mouth");
});

test("the flight takes a motion token's time and fits the 450 ms budget", () => {
  assert.equal(FLIGHT_MS, duration.slow);
  assert.ok(FLIGHT_MS <= 450);
});

test("the thumbnail is capped so a whole page does not fly as a poster", () => {
  const big = thumbSize({ width: 1900, height: 1000 });
  assert.ok(big.width <= 160 && big.height <= 160);
  assert.ok(Math.abs(big.width / big.height - 1.9) < 0.05);
  const tiny = thumbSize({ width: 20, height: 10 });
  assert.ok(tiny.width >= 20, "never upscaled past its own size by much");
});

test("a start on top of Blink still gives a finite path", () => {
  const path = flightPath({ x: 1790, y: 890, width: 20, height: 20 }, { x: 1800, y: 900 });
  for (const t of [0, 0.5, 1]) {
    const p = path.at(t);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.scale));
  }
});
