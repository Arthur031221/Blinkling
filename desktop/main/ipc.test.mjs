import test from "node:test";
import assert from "node:assert/strict";
import { validCommand, validRegions } from "./ipc.mjs";
test("IPC accepts only bounded positive geometry and narrow commands", () => {
  const bounds = { width: 600, height: 400 };
  assert.equal(
    validRegions([{ x: 0, y: 0, width: 1, height: 1 }], bounds),
    true,
  );
  for (const r of [
    { x: -1, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: Infinity, height: 1 },
    { x: 600, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 1, height: 0 },
  ])
    assert.equal(validRegions([r], bounds), false);
  assert.equal(
    validRegions(Array(4097).fill({ x: 0, y: 0, width: 1, height: 1 }), bounds),
    false,
  );
  assert.equal(validCommand({ type: "pin", value: true }), true);
  for (const c of [
    null,
    "state",
    { type: "pin", value: 1 },
    { type: "drag-start", x: 99 },
    { type: "exec", command: "ls" },
  ])
    assert.equal(validCommand(c), false);
});
test("drag starts carry only a finite anchor inside the window margins", () => {
  const bounds = { width: 600, height: 400 };
  assert.equal(
    validCommand({ type: "drag-start", anchor: { x: 598, y: 300 } }, bounds),
    true,
  );
  for (const anchor of [
    null,
    [],
    { x: NaN, y: 0 },
    { x: 0, y: Infinity },
    { x: -161, y: 0 },
    { x: 761, y: 0 },
    { x: 0, y: 577 },
    { x: 0, y: 0, extra: 1 },
  ])
    assert.equal(validCommand({ type: "drag-start", anchor }, bounds), false);
  assert.equal(validCommand({ type: "drag-start" }, bounds), false);
});
