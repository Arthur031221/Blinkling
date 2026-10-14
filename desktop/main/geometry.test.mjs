import test from "node:test";
import assert from "node:assert/strict";
import { contains, roundedContains, pixelRectToDip } from "./geometry.mjs";
for (const scale of [1, 1.5, 2])
  test(`capture coordinates preserve alignment at ${scale * 100}% with a region offset`, () => {
    const capture = {
      region: { x: 120, y: 80, width: 800, height: 600 },
      pixelWidth: 800 * scale,
      pixelHeight: 600 * scale,
    };
    assert.deepEqual(
      pixelRectToDip(
        {
          x: 100 * scale,
          y: 50 * scale,
          width: 60 * scale,
          height: 40 * scale,
        },
        capture,
      ),
      { x: 220, y: 130, width: 60, height: 40 },
    );
  });
test("hit region excludes right and bottom edges, supports negative display coordinates", () => {
  const r = { x: -100, y: -50, width: 30, height: 20 };
  assert.equal(contains(r, { x: -90, y: -40 }), true);
  assert.equal(contains(r, { x: -70, y: -40 }), false);
  assert.equal(contains(r, { x: -90, y: -30 }), false);
});
test("rounded card corners pass clicks through, while curved edges and centre receive input", () => {
  const r = { x: -200, y: 80, width: 460, height: 540 };
  assert.equal(roundedContains(r, { x: -199, y: 81 }, 24), false);
  assert.equal(roundedContains(r, { x: -193, y: 87 }, 24), false);
  assert.equal(roundedContains(r, { x: -176, y: 81 }, 24), true);
  assert.equal(roundedContains(r, { x: -193, y: 104 }, 24), true);
  assert.equal(roundedContains(r, { x: 20, y: 300 }, 24), true);
  assert.equal(roundedContains(r, { x: 259, y: 619 }, 24), false);
  assert.equal(roundedContains(r, { x: 260, y: 300 }, 24), false);
});
