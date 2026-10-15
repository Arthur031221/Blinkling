import test from "node:test";
import assert from "node:assert/strict";
import { placeMini, MINI_WIDTH } from "./placement.mjs";

const work = { x: 0, y: 0, width: 1280, height: 800 };
const size = { width: MINI_WIDTH, height: 140 };
const inside = (b) =>
  b.x >= work.x &&
  b.y >= work.y &&
  b.x + b.width <= work.x + work.width &&
  b.y + b.height <= work.y + work.height;

test("Blink on the right edge puts the mini box to its left, centred on Blink", () => {
  const b = placeMini({ blink: { x: 1280, y: 400 }, size, workArea: work });
  assert.ok(b.x + b.width < 1280);
  assert.equal(Math.round(b.y + b.height / 2), 400);
  assert.ok(inside(b));
});

test("Blink on the left edge puts it to the right", () => {
  const b = placeMini({ blink: { x: 0, y: 400 }, size, workArea: work });
  assert.ok(b.x > 0);
  assert.ok(inside(b));
});

test("near a corner it stays on screen", () => {
  for (const blink of [
    { x: 1280, y: 5 },
    { x: 1280, y: 795 },
    { x: 0, y: 0 },
    { x: 640, y: 800 },
    { x: 640, y: 0 },
  ]) {
    assert.ok(
      inside(placeMini({ blink, size, workArea: work })),
      JSON.stringify(blink),
    );
  }
});

test("on a bottom edge it goes above Blink", () => {
  const b = placeMini({ blink: { x: 640, y: 800 }, size, workArea: work });
  assert.ok(b.y + b.height <= 800);
});

test("a window taller than the work area is clamped to it", () => {
  const b = placeMini({
    blink: { x: 640, y: 400 },
    size: { width: MINI_WIDTH, height: 2000 },
    workArea: work,
  });
  assert.equal(b.height, work.height);
});
