import test from "node:test";
import assert from "node:assert/strict";
import { scanlines, roundedRect, capsule } from "./silhouette.mjs";
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
    [roundedRect(50, 50, 60, 80, 20), capsule(140, 20, 150, 60, 8)],
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
