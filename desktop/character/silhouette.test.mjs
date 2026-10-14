import test from "node:test";
import assert from "node:assert/strict";
import { polygonsToRegions } from "./silhouette.mjs";
import { contains } from "../main/geometry.mjs";
test("animated silhouette union leaves empty corners and gaps click-through, clips outside screen", () => {
  const regions = polygonsToRegions(
    [
      [
        { x: -5, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 20 },
      ],
      [
        { x: 20, y: 0 },
        { x: 25, y: 0 },
        { x: 25, y: 10 },
        { x: 20, y: 10 },
      ],
    ],
    { width: 30, height: 30 },
  );
  const hit = (x, y) => regions.some((r) => contains(r, { x, y }));
  assert.equal(hit(0, 0), false);
  assert.equal(hit(5, 10), true);
  assert.equal(hit(15, 5), false);
  assert.equal(hit(22, 5), true);
  assert.ok(regions.every((r) => r.x >= 0 && r.x + r.width <= 30));
});
