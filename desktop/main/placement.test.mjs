import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPlacement,
  snapPlacement,
  resolvePlacement,
  visiblePlacement,
} from "./placement.mjs";
const display = {
  id: "one",
  workArea: { x: -1280, y: -100, width: 1280, height: 800 },
  scaleFactor: 1.5,
};
test("default peeks halfway through the right edge near the bottom", () => {
  const p = defaultPlacement(display);
  assert.equal(p.edge, "right");
  assert.deepEqual(resolvePlacement(p, display), { x: 1280, y: 690 });
});
test("snap uses DIP and the nearest edge including corners and negative origins", () => {
  assert.deepEqual(snapPlacement({ x: -1278, y: 270 }, display), {
    edge: "left",
    fraction: 0.4625,
  });
  assert.deepEqual(snapPlacement({ x: -1, y: -97 }, display), {
    edge: "right",
    fraction: 0,
  });
  assert.deepEqual(snapPlacement({ x: -700, y: 698 }, display), {
    edge: "bottom",
    fraction: 580 / 1280,
  });
});
test("remembered positions track work-area changes without applying scale twice", () => {
  const changed = {
    ...display,
    workArea: { x: 300, y: 0, width: 640, height: 400 },
    scaleFactor: 2,
  };
  assert.deepEqual(resolvePlacement({ edge: "left", fraction: 0.5 }, changed), {
    x: 0,
    y: 200,
  });
  const p = visiblePlacement({ x: 640, y: 380 }, changed);
  assert.ok(p.x <= 550 && p.x >= 90);
  assert.ok(p.y <= 304 && p.y >= 230);
});
