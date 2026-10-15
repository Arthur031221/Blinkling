import test from "node:test";
import assert from "node:assert/strict";
import { validateDrawing, validateRect } from "./validate.mjs";

const bounds = { width: 1280, height: 800 };
const rect = { x: 10, y: 20, width: 100, height: 50 };

test("avoid areas are plain rectangles: more than 99 of them are fine", () => {
  const many = Array.from({ length: 150 }, () => validateRect(rect, bounds));
  assert.equal(many.length, 150);
  assert.deepEqual(many[0], rect);
  assert.notEqual(many[0], rect, "a copy, not the caller's object");
});

test("a rectangle outside the display is refused", () => {
  assert.throws(() => validateRect({ ...rect, x: 1200 }, bounds), /Invalid/);
  assert.throws(() => validateRect({ ...rect, width: 0 }, bounds), /Invalid/);
  assert.throws(() => validateRect(null, bounds), /Invalid/);
});

test("a drawing keeps its mark number to 1..99", () => {
  assert.equal(validateDrawing({ rect, n: 99 }, bounds, 0).number, 99);
  assert.throws(
    () => validateDrawing({ rect, n: 100 }, bounds, 0),
    /Invalid drawing number/,
  );
  assert.equal(validateDrawing({ rect }, bounds, 3).number, 4);
});

test("a drawing refuses an unknown kind", () => {
  assert.throws(
    () => validateDrawing({ rect, kind: "sparkle" }, bounds, 0),
    /Invalid drawing kind/,
  );
});
