import test from "node:test";
import assert from "node:assert/strict";
import { validCommand, validRegions } from "./ipc.mjs";
test("shell IPC admits only narrow gestures and boolean state, never arbitrary positions/files", () => {
  for (const c of [
    { type: "state" },
    { type: "pin", value: true },
    { type: "visibility", value: false },
    { type: "drag", phase: "end" },
    { type: "click", permission: false },
    { type: "click", permission: true },
    { type: "fan-labels-seen" },
    { type: "swallowed" },
    { type: "alert", value: true },
  ])
    assert.equal(validCommand(c), true);
  for (const c of [
    { type: "exec", path: "/bin/sh" },
    { type: "pin", value: "true" },
    { type: "drag", phase: "start", x: 100 },
    { type: "click" },
    { type: "click", permission: "yes" },
    { type: "click", permission: true, x: 4 },
    { type: "state", file: "/etc/passwd" },
    { type: "fan-labels-seen", value: true },
    { type: "swallowed", at: 3 },
    { type: "alert", value: "yes" },
    { type: "alert" },
    null,
    [],
  ])
    assert.equal(validCommand(c), false);
});
test("input regions reject nonfinite, unbounded, fractional, oversized and empty rectangles", () => {
  const b = { width: 500, height: 500 };
  assert.equal(
    validRegions([{ x: 10, y: 20, width: 30, height: 40 }], b),
    true,
  );
  for (const r of [
    { x: NaN, y: 0, width: 1, height: 1 },
    { x: -1, y: 0, width: 2, height: 2 },
    { x: 0, y: 0, width: 501, height: 1 },
    { x: 1.5, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
  ])
    assert.equal(validRegions([r], b), false);
  assert.equal(
    validRegions(Array(8193).fill({ x: 0, y: 0, width: 1, height: 1 }), b),
    false,
  );
});
