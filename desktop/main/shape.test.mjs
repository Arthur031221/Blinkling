import test from "node:test";
import assert from "node:assert/strict";
import { windowShape } from "./shape.mjs";
import { validRegions } from "./ipc.mjs";

const body = [{ x: 10, y: 10, width: 100, height: 100 }];
const bubble = [{ x: 130, y: 40, width: 200, height: 48 }];

test("on Windows the bubbles are in the shape the window is clipped to, beside Blink", () => {
  assert.deepEqual(windowShape("win32", body, bubble), [...body, ...bubble]);
  assert.deepEqual(windowShape("win32", body), body);
});

test("elsewhere the shape stays Blink's own, so a bubble never takes a press", () => {
  for (const platform of ["darwin", "linux"])
    assert.deepEqual(windowShape(platform, body, bubble), body);
});

test("the bubble boxes pass the same check as the rest of the regions", () => {
  assert.equal(validRegions(bubble, { width: 400, height: 300 }), true);
  assert.equal(validRegions(bubble, { width: 300, height: 300 }), false);
});
