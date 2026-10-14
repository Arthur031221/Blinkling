import test from "node:test";
import assert from "node:assert/strict";
import {
  snapPosition,
  resolvePosition,
  reconcileDisplay,
  cardBounds,
} from "./placement.mjs";
const display = {
  id: 1,
  bounds: { x: -1280, y: 0, width: 1280, height: 800 },
  workArea: { x: -1280, y: 24, width: 1280, height: 752 },
  scaleFactor: 1.5,
};
test("default is half hidden at the right edge, near the bottom; reveal stays inside work area", () => {
  const p = resolvePosition(display);
  assert.equal(p.peek.x, 1280);
  assert.equal(p.edge, "right");
  assert.ok(p.peek.y > 600 && p.peek.y < 752);
  assert.ok(p.reveal.x < 1220);
});
test("drag release selects nearest edge including negative origins and corners", () => {
  assert.equal(snapPosition(display, { x: -1270, y: 260 }).edge, "left");
  assert.equal(snapPosition(display, { x: -600, y: 30 }).edge, "top");
  const bottom = snapPosition(display, { x: -600, y: 772 });
  assert.equal(bottom.edge, "bottom");
  assert.ok(bottom.ratio > 0.4 && bottom.ratio < 0.6);
});
test("stored normalized placement survives resolution and scale changes independently for each display", () => {
  const stored = snapPosition(display, { x: -1270, y: 340 });
  const resized = {
    ...display,
    bounds: { x: -1920, y: -400, width: 1920, height: 1200 },
    workArea: { x: -1920, y: -376, width: 1920, height: 1152 },
    scaleFactor: 2,
  };
  const a = resolvePosition(display, stored),
    b = resolvePosition(resized, stored);
  assert.equal(a.edge, b.edge);
  assert.ok(Math.abs((a.peek.y - 24) / 752 - (b.peek.y - 24) / 1152) < 0.02);
  assert.equal(
    resolvePosition(display, { edge: "shell:exec", ratio: NaN }).edge,
    "right",
  );
});
test("display removal falls back without discarding saved positions for disconnected displays", () => {
  assert.equal(reconcileDisplay([display, { ...display, id: 2 }], 2).id, 2);
  assert.equal(reconcileDisplay([display], 2).id, 1);
});
for (const scale of [1, 1.5, 2])
  test(`rounded card stays on its display at ${scale * 100}% and negative origins`, () => {
    const scaled = { ...display, scaleFactor: scale };
    const b = cardBounds(scaled, resolvePosition(scaled));
    assert.ok(b.x >= display.workArea.x && b.y >= display.workArea.y);
    assert.ok(b.x + b.width <= display.workArea.x + display.workArea.width);
    assert.ok(b.y + b.height <= display.workArea.y + display.workArea.height);
  });
