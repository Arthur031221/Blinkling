import test from "node:test";
import assert from "node:assert/strict";
import {
  snapPosition,
  resolvePosition,
  reconcileDisplay,
  cardBounds,
} from "./placement.mjs";
import { menuLayout, menuTransform } from "../menu/layout.mjs";
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

const corners = [
  ["top-left", (a) => ({ x: a.x, y: a.y })],
  ["top-right", (a) => ({ x: a.x + a.width, y: a.y })],
  ["bottom-left", (a) => ({ x: a.x, y: a.y + a.height })],
  ["bottom-right", (a) => ({ x: a.x + a.width, y: a.y + a.height })],
];
const inside = (r, a) =>
  r.x >= a.x - 0.5 &&
  r.y >= a.y - 0.5 &&
  r.x + r.width <= a.x + a.width + 0.5 &&
  r.y + r.height <= a.y + a.height + 0.5;
for (const scale of [1, 1.5])
  for (const [name, corner] of corners)
    test(`${name} rest position at ${scale * 100}%: hover keeps x, card and menu stay on screen`, () => {
      const physical = { width: 1920, height: 1080 };
      const bounds = {
        x: 0,
        y: 0,
        width: physical.width / scale,
        height: physical.height / scale,
      };
      const d = {
        id: 1,
        bounds,
        workArea: { ...bounds, y: 28, height: bounds.height - 28 },
        scaleFactor: scale,
      };
      const saved = snapPosition(d, corner(d.workArea));
      const p = resolvePosition(d, saved);
      const area = p.area;
      // The character is 148 wide and hangs 142 above its anchor.
      const body = (at) => ({
        x: at.x - 74,
        y: at.y - 142,
        width: 148,
        height: 152,
      });
      if (p.edge === "top" || p.edge === "bottom")
        assert.equal(
          p.reveal.x,
          p.peek.x,
          "hover must not move the character along the edge",
        );
      assert.ok(p.reveal.y >= area.y && p.reveal.y <= area.y + area.height);
      if (p.edge === "left" || p.edge === "right")
        assert.ok(
          body(p.reveal).y >= area.y,
          "revealed body stays below the top",
        );
      if (p.edge === "top" || p.edge === "bottom")
        assert.ok(inside({ ...body(p.reveal), y: area.y }, area));
      assert.ok(inside(cardBounds(d, p), d.workArea), "card");
      for (const rect of menuLayout(area, p.reveal)) {
        const shown = menuTransform(area, p.reveal, rect, 1);
        const w = rect.width * shown.scale,
          h = rect.height * shown.scale;
        const cx = rect.x + shown.x + rect.width / 2,
          cy = rect.y + shown.y + rect.height / 2;
        assert.ok(
          inside({ x: cx - w / 2, y: cy - h / 2, width: w, height: h }, area),
          "menu pill",
        );
      }
    });
test("reveal never moves a top or bottom resting character sideways", () => {
  for (const edge of ["top", "bottom"])
    for (const ratio of [0, 0.02, 0.5, 0.98, 1]) {
      const p = resolvePosition(display, { edge, ratio });
      assert.equal(p.reveal.x, p.peek.x, `${edge} ${ratio}`);
    }
});
test("revealed anchor leaves room for the whole fan above it", () => {
  const p = resolvePosition(display, { edge: "top", ratio: 0.5 });
  const rows = p.area.height < 610 ? 4 : 8;
  assert.ok(
    p.reveal.y >=
      Math.min(p.area.y + p.area.height - 18, p.area.y + rows * 51 + 156),
  );
});
