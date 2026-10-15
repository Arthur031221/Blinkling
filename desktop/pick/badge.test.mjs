import test from "node:test";
import assert from "node:assert/strict";
import { badgeFor, badgeOffset } from "./badge.mjs";

test("Ctrl held shows the green crayon badge", () => {
  assert.equal(badgeFor({ raised: true, dragging: false }), "crayon");
});

test("once a drag starts it turns into the crosshair with a dashed rectangle", () => {
  assert.equal(badgeFor({ raised: true, dragging: true }), "crosshair");
});

test("no key, no badge", () => {
  assert.equal(badgeFor({ raised: false, dragging: false }), "none");
  assert.equal(badgeFor({ raised: false, dragging: true }), "none");
});

test("Shift is not a mode: there is no Shift badge", () => {
  assert.equal(
    badgeFor({ raised: false, dragging: false, shift: true }),
    "none",
  );
  assert.equal(
    badgeFor({ raised: true, dragging: false, shift: true }),
    "crayon",
  );
});

test("the badge sits beside the cursor and flips at the screen edge", () => {
  const bounds = { x: 0, y: 0, width: 1000, height: 600 };
  const size = { width: 28, height: 28 };
  const free = badgeOffset({ x: 200, y: 200 }, bounds, size);
  assert.ok(free.x > 200 && free.y > 200);
  const corner = badgeOffset({ x: 995, y: 595 }, bounds, size);
  assert.ok(corner.x + size.width <= 1000 && corner.y + size.height <= 600);
  assert.ok(corner.x < 995 && corner.y < 595);
});
