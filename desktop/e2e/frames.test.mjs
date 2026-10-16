import test from "node:test";
import assert from "node:assert/strict";
import { measure, recordFrames, verdict, JUMP, SURGE } from "./frames.mjs";

const box = (x, y = 0, width = 40, height = 40) => ({ x, y, width, height });
const run = (surface, gaps, boxes = () => box(0), start = 0) => {
  let t = start;
  return [0, ...gaps].map((gap, i) => ({
    surface,
    t: (t += gap),
    box: boxes(i),
  }));
};

test("a steady 60 Hz run has a 16.7 ms p95 and no jumps", () => {
  const m = measure(run("fan", Array(60).fill(16.7), (i) => box(i * 5)));
  assert.equal(m.frames, 61);
  assert.ok(m.p95 <= 20 && m.max <= 50);
  assert.deepEqual(m.jumps, []);
});

test("one slow frame in twenty moves the p95; one over 50 ms is the max", () => {
  const gaps = Array(39).fill(16);
  gaps[10] = 30;
  gaps[11] = 30;
  gaps[30] = 60;
  const m = measure(run("peek", gaps));
  assert.equal(m.p95, 30);
  assert.equal(m.max, 60);
  assert.deepEqual(verdict({ surfaces: { peek: m } }), [
    "peek: p95 30.0 ms > 20",
    "peek: a frame took 60.0 ms > 50",
  ]);
});

test("a pause between two animations is not a dropped frame", () => {
  const log = [
    ...run("fan", Array(10).fill(16)),
    ...run("fan", Array(10).fill(16), () => box(0), 5000),
  ];
  assert.equal(measure(log, "fan").max, 16);
});

test("a box that moves more than the limit between two frames is a jump, a smooth one is not", () => {
  const smooth = measure(run("flight", Array(30).fill(16), (i) => box(i * 30)));
  assert.deepEqual(smooth.jumps, []);
  const jumped = measure(
    run("flight", Array(30).fill(16), (i) => box(i < 15 ? i * 10 : 400 + i)),
  );
  assert.equal(jumped.jumps.length, 1);
  assert.ok(jumped.jumps[0].moved > JUMP);
  // A box that grows by a lot in one frame jumps too, though its corner stays.
  const grown = measure(
    run("fan", [16, 16, 16], (i) => box(0, 0, i < 2 ? 40 : 400, 40)),
  );
  assert.equal(grown.jumps.length, 1);
});

test("a fast flight that eases in and out is not a jump, a doubled step is", () => {
  const at = (steps) => {
    let x = 0;
    return (i) => box((x += steps[i - 1] ?? 0));
  };
  const eased = [3, 19, 67, 129, 162, 151, 123, 101, 80];
  const smooth = measure(
    run("flight", Array(eased.length).fill(16), at(eased)),
  );
  assert.ok(Math.max(...eased) > JUMP);
  assert.deepEqual(smooth.jumps, []);
  const dropped = [3, 19, 67, 129, 129, 290, 123, 101, 80];
  assert.ok(290 > 129 * SURGE);
  const doubled = measure(
    run("flight", Array(dropped.length).fill(16), at(dropped)),
  );
  assert.equal(doubled.jumps.length, 1);
});

test("a frame with no box ends the comparison instead of faking a jump", () => {
  const swap = (i) => (i === 2 ? null : box(i < 2 ? 0 : 800));
  const log = run("pointing", [16, 16, 16, 16], swap);
  assert.deepEqual(measure(log).jumps, []);
  assert.equal(
    measure(run("pointing", [16, 16, 16, 16], (i) => box(i < 2 ? 0 : 800)))
      .jumps.length,
    1,
  );
});

test("recordFrames clears the log, runs the action and reports the worst surface", async () => {
  const state = { cleared: 0, log: [] };
  const page = {
    evaluate: async (fn) =>
      fn.toString().includes("splice")
        ? void (state.cleared++, state.log.splice(0))
        : state.log,
  };
  const result = await recordFrames(page, async () => {
    state.log.push(...run("fan", Array(30).fill(16)));
    state.log.push(...run("peek", [16, 16, 16, 55]));
  });
  assert.equal(state.cleared, 1);
  assert.equal(result.max, 55);
  assert.equal(result.surfaces.fan.max, 16);
  assert.equal(result.frames, 36);
  assert.deepEqual(result.jumps, []);
});
