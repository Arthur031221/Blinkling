import test from "node:test";
import assert from "node:assert/strict";
import { blinkRect } from "./blink-rect.mjs";

const display = {
  bounds: { x: 1280, y: 0, width: 1280, height: 800 },
  workArea: { x: 1280, y: 0, width: 1280, height: 760 },
};
const position = { edge: "right", peek: { x: 1280, y: 640 }, reveal: { x: 1190, y: 640 } };

test("Blink's rect is the character box around its anchor, in global DIP", () => {
  const r = blinkRect({ display, position: { ...position, peek: { x: 600, y: 500 } } });
  assert.deepEqual(r, { x: 1280 + 600 - 74, y: 500 - 142, width: 148, height: 152 });
});

test("only the part of Blink that is on the screen counts", () => {
  const r = blinkRect({ display, position });
  assert.equal(r.x + r.width, 2560);
  assert.equal(r.width, 74);
  assert.equal(r.y, 498);
});

test("a revealed Blink uses the reveal anchor", () => {
  const r = blinkRect({ display, position, revealed: true });
  assert.equal(r.x, 1280 + 1190 - 74);
});
