import test from "node:test";
import assert from "node:assert/strict";
import { toUnits, gazeAt } from "./touch.mjs";
import { BLINK_SCALE } from "./size.mjs";

const feet = { x: 500, y: 600 };
/** A point given in drawing units: x from the centre line, y in the scene. */
const at = (x, y) => ({
  x: feet.x + x * BLINK_SCALE,
  y: feet.y + (y - 190) * BLINK_SCALE,
});

test("the units round trip through the scaled drawing", () => {
  const u = toUnits(at(30, 80), feet);
  assert.ok(Math.abs(u.x - 30) < 1e-9 && Math.abs(u.y - 80) < 1e-9);
});

test("the gaze points toward a point and saturates a few faces away", () => {
  const eyes = at(0, 92);
  const centred = gazeAt(eyes, feet);
  assert.ok(Math.abs(centred.x) < 1e-9 && Math.abs(centred.y) < 1e-9);
  assert.ok(gazeAt(at(-100, 92), feet).x < 0);
  assert.ok(gazeAt(at(100, 92), feet).x > 0);
  assert.ok(gazeAt(at(0, 190), feet).y > 0, "feet are below the eyes");
  assert.ok(gazeAt(at(0, -300), feet).y < 0);
  assert.deepEqual(gazeAt({ x: 5000, y: -5000 }, feet), { x: 1, y: -1 });
});
