import test from "node:test";
import assert from "node:assert/strict";
import { scanlines, roundedRect, clipAbove, grow } from "./silhouette.mjs";
import { contains } from "../main/geometry.mjs";
test("scanlines follow rounded shape and leave corner pixels click-through", () => {
  const regions = scanlines([roundedRect(20, 30, 100, 100, 30)], {
    width: 200,
    height: 200,
  });
  const hit = (x, y) => regions.some((r) => contains(r, { x, y }));
  assert.equal(hit(20, 30), false);
  assert.equal(hit(70, 30), true);
  assert.equal(hit(70, 80), true);
  assert.equal(hit(120, 80), false);
});
test("separate waving limbs remain interactive and the empty space between them passes through", () => {
  const regions = scanlines(
    [roundedRect(50, 50, 60, 80, 20), roundedRect(138, 20, 16, 40, 8)],
    { width: 200, height: 200 },
  );
  const hit = (x, y) => regions.some((r) => contains(r, { x, y }));
  assert.equal(hit(143, 36), true);
  assert.equal(hit(125, 40), false);
  assert.equal(hit(80, 90), true);
});
test("regions are bounded and merged rather than capturing empty rectangular gaps", () => {
  const rs = scanlines(
    [roundedRect(-40, -30, 80, 90, 20), roundedRect(20, 0, 60, 60, 20)],
    { width: 100, height: 100 },
  );
  assert.ok(
    rs.every(
      (r) =>
        r.x >= 0 && r.y >= 0 && r.x + r.width <= 100 && r.y + r.height <= 100,
    ),
  );
  assert.ok(rs.length < 150);
});
test("a polygon is cut at a line and only the near side stays", () => {
  const box = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const cut = clipAbove(box, 4);
  assert.ok(cut.every((p) => p.y <= 4));
  assert.equal(Math.max(...cut.map((p) => p.y)), 4);
  assert.deepEqual(clipAbove(box, 20), box);
  assert.equal(clipAbove(box, -1).length, 0);
});
test("a margin grows every span by a round distance and stays on screen", () => {
  const rows = grow([{ x: 20, y: 20, width: 10, height: 1 }], 6, {
    width: 40,
    height: 40,
  });
  const hit = (x, y) =>
    rows.some((r) => r.y === y && x >= r.x && x < r.x + r.width);
  assert.equal(hit(20, 14), true);
  assert.equal(hit(14, 20), true);
  assert.equal(hit(13, 20), false);
  assert.equal(hit(20, 13), false);
  assert.equal(hit(15, 15), false, "the corner is round, not a box");
  assert.ok(
    rows.every((r) => r.x >= 0 && r.x + r.width <= 40 && r.y >= 0 && r.y < 40),
  );
});
