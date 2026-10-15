import test from "node:test";
import assert from "node:assert/strict";
import { stepSpring, settled } from "./spring.mjs";
import { spring } from "../character/state.mjs";
import { springs } from "../shared/motion.mjs";

const DT = 1 / 60;
const analytic = (q, target, f) => stepSpring(q, target, f, DT);
const implicit = (q, target, f) => spring(q.value, target, q.velocity, DT, f);

// N6.2: a motion can be turned around at any moment. The new target changes
// the pull, never the position or the velocity the motion already has.
for (const [name, step] of [
  ["stepSpring", analytic],
  ["spring", implicit],
]) {
  test(`${name}: retargeting mid-flight keeps position and velocity, no restart`, () => {
    let q = { value: 0, velocity: 0 };
    for (let i = 0; i < 6; i++) q = step(q, 1, springs.crisp);
    assert.ok(q.value > 0.1 && q.value < 0.9, "in flight");
    assert.ok(q.velocity > 0, "moving towards 1");
    const turned = step(q, 0, springs.crisp);
    // One frame later the position is a step away, not back at the start.
    assert.ok(Math.abs(turned.value - q.value) < 0.08, "no jump");
    assert.ok(turned.velocity < q.velocity, "the pull now points back");
    // The momentum is carried: it coasts a little, then returns.
    let peak = q.value;
    for (let i = 0; i < 120; i++) {
      q = step(q, 0, springs.crisp);
      peak = Math.max(peak, q.value);
    }
    assert.ok(peak - 0.5 < 0.12, `coast stays short, peaked at ${peak}`);
    assert.ok(settled(q, 0), "and comes to rest at the new target");
  });

  test(`${name}: reversing twice in a row never leaves the travel by more than the coast`, () => {
    let q = { value: 0, velocity: 0 };
    let worst = 0;
    let target = 1;
    for (let i = 0; i < 180; i++) {
      if (i % 9 === 0) target = 1 - target;
      q = step(q, target, springs.soft);
      worst = Math.max(worst, -q.value, q.value - 1);
    }
    assert.ok(worst < 0.05, `overshoot ${worst}`);
  });
}

test("both helpers agree to the frame on where a retargeted motion goes", () => {
  let a = { value: 0, velocity: 0 };
  let b = { value: 0, velocity: 0 };
  for (let i = 0; i < 30; i++) {
    const target = i < 8 ? 1 : 0;
    a = analytic(a, target, springs.crisp);
    b = implicit(b, target, springs.crisp);
  }
  assert.ok(Math.abs(a.value - b.value) < 0.05);
});
