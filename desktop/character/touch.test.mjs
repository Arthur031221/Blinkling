import test from "node:test";
import assert from "node:assert/strict";
import { partAt, touchPart, toUnits, gazeAt } from "./touch.mjs";
import { BLINK_SCALE } from "./size.mjs";

const feet = { x: 500, y: 600 };
const at = (x, y) => ({
  x: feet.x + x * (148 / 420) * BLINK_SCALE,
  y: feet.y + (y + 3) * (148 / 420) * BLINK_SCALE,
});

test("the units round trip through the scaled drawing", () => {
  const u = toUnits(at(30, -200), feet);
  assert.ok(Math.abs(u.x - 30) < 1e-9 && Math.abs(u.y + 200) < 1e-9);
});

test("each part of the body is named", () => {
  assert.equal(touchPart(at(0, -300), feet), "head");
  assert.equal(
    touchPart(at(-30, -200), feet),
    "head",
    "between the eyes and cheeks",
  );
  assert.equal(touchPart(at(86, -196), feet), "cheek");
  assert.equal(touchPart(at(-86, -196), feet), "cheek");
  assert.equal(touchPart(at(0, -110), feet), "belly");
  assert.equal(touchPart(at(130, -150), feet), "hand");
  assert.equal(touchPart(at(-130, -150), feet), "hand");
  assert.equal(touchPart(at(-52, -40), feet), "foot");
});

test("outside the body nothing is touched", () => {
  assert.equal(partAt({ x: 200, y: -200 }), null);
  assert.equal(partAt({ x: 0, y: -400 }), null);
  assert.equal(partAt({ x: 0, y: 40 }), null);
  assert.equal(partAt({ x: 125, y: -300 }), null, "above the hand");
  assert.equal(partAt({ x: 125, y: -40 }), null, "beside the foot");
});

test("the gaze points toward a point and saturates a few faces away", () => {
  const eyes = at(0, -205);
  const centred = gazeAt(eyes, feet);
  assert.ok(Math.abs(centred.x) < 1e-9 && Math.abs(centred.y) < 1e-9);
  assert.ok(gazeAt(at(-100, -205), feet).x < 0);
  assert.ok(gazeAt(at(100, -205), feet).x > 0);
  assert.ok(gazeAt(at(0, 0), feet).y > 0, "feet are below the eyes");
  assert.ok(gazeAt(at(0, -600), feet).y < 0);
  assert.deepEqual(gazeAt({ x: 5000, y: -5000 }, feet), { x: 1, y: -1 });
});
