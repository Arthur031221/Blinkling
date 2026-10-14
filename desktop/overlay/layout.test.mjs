import { test } from "node:test";
import assert from "node:assert/strict";
import { placeCallouts } from "./layout.mjs";
// 1280x720 at 150%: Electron reports 853x480 DIP.
const W = 853,
  H = 480;
const size = { width: 110, height: 30 };
const item = (x, y, width, height, s = size) => ({
  rect: { x, y, width, height },
  size: s,
});
const overlaps = (a, b) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
function assertSound(boxes, avoid = []) {
  const placed = boxes.filter(Boolean);
  for (const [i, p] of placed.entries()) {
    assert.ok(
      p.x >= 8 && p.y >= 8 && p.x + p.width <= W - 8 && p.y + p.height <= H - 8,
      `inside ${i}`,
    );
    for (const q of placed.slice(i + 1))
      assert.equal(overlaps(p, q), false, "callouts overlap");
    for (const a of avoid)
      assert.equal(overlaps(p, a), false, "callout on a Blink window");
  }
}
test("callouts at every edge of a 1280x720@150% screen are placed without throwing", () => {
  const items = [
    item(0, 0, 120, 40),
    item(W - 90, 0, 90, 40),
    item(0, H - 40, 120, 40),
    item(W - 120, H - 40, 120, 40),
    item(300, 0, 200, 30),
    item(300, H - 30, 200, 30),
    item(0, 200, 60, 80),
    item(W - 60, 200, 60, 80),
  ];
  const avoid = [{ x: 560, y: 300, width: 280, height: 170 }];
  const boxes = placeCallouts({ width: W, height: H, items, avoid });
  assert.equal(boxes.filter(Boolean).length, items.length);
  assertSound(boxes, avoid);
});
test("a full-screen section keeps its label inside it, above the lower margin", () => {
  const [box] = placeCallouts({
    width: W,
    height: H,
    items: [item(0, 0, W, H)],
  });
  assert.deepEqual(box, { x: 8, y: H - 30 - 8, width: 110, height: 30 });
});
test("when the screen is full the surplus callouts are dropped and the guide still lays out", () => {
  const items = Array.from({ length: 24 }, (_, i) =>
    item((i % 6) * 140, Math.floor(i / 6) * 115, 130, 105, {
      width: 200,
      height: 60,
    }),
  );
  const boxes = placeCallouts({ width: W, height: H, items });
  assert.equal(boxes.length, 24);
  const placed = boxes.filter(Boolean);
  assert.ok(placed.length >= 6, `placed ${placed.length}`);
  assert.ok(placed.length < 24, "something had to be dropped");
  assertSound(boxes);
});
test("a callout larger than the screen is dropped, the others are kept", () => {
  const boxes = placeCallouts({
    width: W,
    height: H,
    items: [
      item(10, 10, 100, 100, { width: 2000, height: 30 }),
      item(300, 200, 100, 100),
    ],
  });
  assert.equal(boxes[0], null);
  assert.ok(boxes[1]);
});
test("a callout prefers a spot next to its own target", () => {
  const [box] = placeCallouts({
    width: W,
    height: H,
    items: [item(300, 200, 120, 60)],
  });
  assert.ok(
    Math.abs(box.y + box.height + 10 - 200) < 1,
    "directly above the target",
  );
});
test("items without a measured size are skipped", () => {
  assert.deepEqual(
    placeCallouts({
      width: W,
      height: H,
      items: [{ rect: { x: 1, y: 1, width: 2, height: 2 }, size: null }],
    }),
    [null],
  );
});
test("a label stays beside its target when a section outlines most of the screen", () => {
  // The page section ends well above the screen's bottom edge; the free strip
  // below it must not pull the heading's label 900 px away from the heading.
  const boxes = placeCallouts({
    width: 1280,
    height: 1024,
    items: [
      item(0, 0, 1280, 800),
      item(24, 24, 260, 48),
      item(240, 160, 160, 100),
    ],
  });
  const heading = boxes[1];
  assert.ok(heading);
  assert.ok(
    Math.hypot(heading.x - 24, heading.y - 24) < 400,
    `label at ${heading.x},${heading.y}`,
  );
  assert.ok(boxes[2].y < 400);
  // A leaf target's own box stays uncovered while there is room beside it.
  for (const [i, own] of [
    [1, { x: 24, y: 24, width: 260, height: 48 }],
    [2, { x: 240, y: 160, width: 160, height: 100 }],
  ])
    assert.equal(
      overlaps(boxes[i], own),
      false,
      `label ${i} covers its target`,
    );
});
