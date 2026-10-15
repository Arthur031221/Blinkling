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

const hits = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
const bodyOf = (p) => ({ x: p.x - 74, y: p.y - 142, width: 148, height: 152 });

test("it never covers Blink's body, so the send button is never under Blink", () => {
  for (const blink of [
    { x: 1280, y: 400 },
    { x: 0, y: 400 },
    { x: 640, y: 800 },
    { x: 640, y: 150 },
    { x: 1280, y: 790 },
  ]) {
    const b = placeMini({ blink, size, workArea: work });
    assert.equal(hits(b, bodyOf(blink)), false, JSON.stringify(blink));
    assert.ok(inside(b));
  }
});

test("it moves aside from what was picked, wherever the pick is", () => {
  const blink = { x: 1280, y: 400 };
  for (const picked of [
    { x: 700, y: 330, width: 400, height: 140 },
    { x: 400, y: 300, width: 380, height: 300 },
    { x: 20, y: 20, width: 500, height: 700 },
    { x: 860, y: 100, width: 300, height: 600 },
  ]) {
    const b = placeMini({ blink, size, workArea: work, avoid: [picked] });
    assert.equal(hits(b, picked), false, JSON.stringify(picked));
    assert.equal(hits(b, bodyOf(blink)), false, JSON.stringify(picked));
    assert.ok(inside(b));
  }
});

test("with room on both sides it stays as near Blink as the pick allows", () => {
  const blink = { x: 1280, y: 400 };
  const free = placeMini({ blink, size, workArea: work });
  const picked = { x: 1000, y: 380, width: 120, height: 80 };
  const b = placeMini({ blink, size, workArea: work, avoid: [picked] });
  assert.equal(hits(b, picked), false);
  assert.ok(free.x + free.width <= bodyOf(blink).x, "free: left of the body");
  assert.ok(Math.abs(b.x - free.x) + Math.abs(b.y - free.y) < 700);
});

test("when nothing fits it covers as little of the pick as it can", () => {
  const everything = { x: 0, y: 0, width: 1280, height: 800 };
  const b = placeMini({
    blink: { x: 1280, y: 400 },
    size,
    workArea: work,
    avoid: [everything],
  });
  assert.ok(inside(b));
  assert.equal(hits(b, bodyOf({ x: 1280, y: 400 })), false);
});

test("Blink's body on another display does not push the box around on this one", () => {
  const second = { x: 1280, y: 0, width: 1280, height: 800 };
  const b = placeMini({
    blink: { x: 100, y: 400 },
    size,
    workArea: second,
    avoid: [],
  });
  assert.ok(b.x >= second.x);
  assert.ok(b.x + b.width <= second.x + second.width);
});
