import test from "node:test";
import assert from "node:assert/strict";
import {
  clampSize,
  resizedSize,
  fractionsOf,
  sizeFrom,
  sizeLimits,
  EDGES,
} from "./card-size.mjs";

const area = { x: 0, y: 25, width: 1440, height: 875 };

test("the limits are 320 x 280 up to nine tenths of the work area", () => {
  assert.deepEqual(sizeLimits(area), {
    minWidth: 320,
    maxWidth: 1296,
    minHeight: 280,
    maxHeight: 787,
  });
});

test("a small display never gets a minimum above its maximum", () => {
  const l = sizeLimits({ width: 300, height: 250 });
  assert.ok(l.minWidth <= l.maxWidth && l.minHeight <= l.maxHeight);
});

test("an edge changes one dimension, a corner both, and the edge moving out grows the card", () => {
  const base = { width: 440, height: 400 };
  assert.deepEqual(resizedSize(base, "e", 60, 99, area), {
    width: 500,
    height: 400,
  });
  assert.deepEqual(resizedSize(base, "w", -60, 99, area), {
    width: 500,
    height: 400,
  });
  assert.deepEqual(resizedSize(base, "s", 99, 50, area), {
    width: 440,
    height: 450,
  });
  assert.deepEqual(resizedSize(base, "n", 99, -50, area), {
    width: 440,
    height: 450,
  });
  for (const [edge, dx, dy] of [
    ["se", 30, 40],
    ["ne", 30, -40],
    ["sw", -30, 40],
    ["nw", -30, -40],
  ])
    assert.deepEqual(resizedSize(base, edge, dx, dy, area), {
      width: 470,
      height: 440,
    });
  assert.equal(EDGES.length, 8);
});

test("the size stays between the minimum and nine tenths of the area", () => {
  const base = { width: 440, height: 400 };
  assert.deepEqual(resizedSize(base, "se", -900, -900, area), {
    width: 320,
    height: 280,
  });
  assert.deepEqual(resizedSize(base, "se", 5000, 5000, area), {
    width: 1296,
    height: 787,
  });
  assert.deepEqual(resizedSize(base, "bogus", 5, 5, area), base);
});

test("the kept fractions give the same share on another display, held to its limits", () => {
  const kept = fractionsOf({ width: 720, height: 437.5 }, area);
  assert.deepEqual(kept, { width: 0.5, height: 0.5 });
  assert.deepEqual(sizeFrom(kept, area), { width: 720, height: 438 });
  const small = { x: 0, y: 0, width: 800, height: 500 };
  assert.deepEqual(sizeFrom(kept, small), { width: 400, height: 280 });
  assert.equal(sizeFrom(null, area), null);
  assert.equal(sizeFrom({ width: 2, height: 0.5 }, area), null);
  assert.equal(sizeFrom({ width: "x", height: 0.5 }, area), null);
});

test("clampSize rounds to whole pixels", () => {
  assert.deepEqual(clampSize({ width: 400.4, height: 300.6 }, area), {
    width: 400,
    height: 301,
  });
});
