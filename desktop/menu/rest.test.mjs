import test from "node:test";
import assert from "node:assert/strict";
import { createRest } from "./rest.mjs";
import { timing } from "../shared/motion.mjs";

test("the fan is ready only after the pointer rests on Blink for the rest time", () => {
  const rest = createRest();
  assert.equal(rest.update(true, 1000), false);
  assert.equal(rest.update(true, 1000 + timing.menuRest - 1), false);
  assert.equal(rest.update(true, 1000 + timing.menuRest), true);
});

test("passing by never opens the fan, however many times", () => {
  const rest = createRest();
  let now = 0;
  for (let pass = 0; pass < 20; pass++) {
    assert.equal(rest.update(true, now), false);
    now += 200;
    assert.equal(rest.update(true, now), false, "a 200 ms pass-by");
    assert.equal(rest.update(false, (now += 16)), false);
    now += 16;
  }
});

test("leaving resets the rest, so coming back waits again", () => {
  const rest = createRest();
  rest.update(true, 0);
  assert.equal(rest.update(true, 400), true);
  assert.equal(rest.update(false, 500), false);
  assert.equal(rest.update(true, 520), false);
  assert.equal(rest.update(true, 520 + timing.menuRest), true);
});

test("a wake without the pointer never opens the fan", () => {
  const rest = createRest();
  for (let now = 0; now < 5000; now += 100)
    assert.equal(rest.update(false, now), false);
});

test("the fan stays ready while the pointer moves between Blink and its bubbles", () => {
  const rest = createRest();
  rest.update(true, 0);
  assert.equal(rest.update(true, 400), true);
  assert.equal(rest.update(true, 900, { keep: true }), true);
  assert.equal(rest.update(false, 950, { keep: true }), true, "over a bubble");
  assert.equal(rest.update(false, 960), false);
});
