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
const screens = {
  "100%": {
    id: 7,
    bounds: { x: 1920, y: -120, width: 1280, height: 800 },
    workArea: { x: 1920, y: -96, width: 1280, height: 752 },
    scaleFactor: 1,
  },
  // Electron reports DIP, so a 150% panel of 1920x1200 px is 1280x800 DIP.
  "150%": {
    id: 8,
    bounds: { x: 0, y: 0, width: 853, height: 533 },
    workArea: { x: 0, y: 24, width: 853, height: 509 },
    scaleFactor: 1.5,
  },
};
const corners = {
  "top-left": (a) => ({ x: a.x + 6, y: a.y + 6 }),
  "top-right": (a) => ({ x: a.x + a.width - 6, y: a.y + 6 }),
  "bottom-left": (a) => ({ x: a.x + 6, y: a.y + a.height - 6 }),
  "bottom-right": (a) => ({ x: a.x + a.width - 6, y: a.y + a.height - 6 }),
};
const overlaps = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
for (const [scale, screen] of Object.entries(screens))
  for (const [name, at] of Object.entries(corners))
    test(`${name} corner is a valid rest position with the card and menu fully on screen at ${scale}`, () => {
      const a = screen.workArea;
      const saved = snapPosition(screen, at(a));
      assert.ok(
        saved.ratio === 0 || saved.ratio === 1,
        "corner snaps to its end",
      );
      const position = resolvePosition(screen, saved);
      const card = cardBounds(screen, position);
      assert.ok(card.x >= a.x && card.x + card.width <= a.x + a.width);
      assert.ok(card.y >= a.y && card.y + card.height <= a.y + a.height);
      // The revealed character, its menu column and its card never overlap.
      const anchor = {
        x: position.reveal.x + screen.bounds.x,
        y: position.reveal.y + screen.bounds.y,
      };
      const character = {
        x: anchor.x - 74,
        y: anchor.y - 142,
        width: 148,
        height: 152,
      };
      assert.ok(!overlaps(card, character), "card clears the revealed Blink");
      const area = position.area;
      assert.ok(
        position.reveal.x >= area.x + 74 &&
          position.reveal.x <= area.x + area.width - 74,
      );
      assert.ok(position.reveal.y - 142 >= area.y - 1);
      assert.ok(position.reveal.y <= area.y + area.height);
    });
test("hovering never changes the position along the edge, anywhere along it", () => {
  for (const screen of Object.values(screens))
    for (const ratio of [0, 0.02, 0.05, 0.5, 0.95, 0.98, 1]) {
      for (const edge of ["top", "bottom"]) {
        const p = resolvePosition(screen, { edge, ratio });
        assert.equal(p.reveal.x, p.peek.x, `${edge} ${ratio}`);
      }
      for (const edge of ["left", "right"]) {
        const p = resolvePosition(screen, { edge, ratio });
        assert.equal(p.reveal.y, p.peek.y, `${edge} ${ratio}`);
      }
    }
});
test("the card takes the side of Blink that has room, whatever the edge", () => {
  const screen = screens["100%"];
  const top = resolvePosition(screen, { edge: "top", ratio: 0 });
  assert.ok(cardBounds(screen, top).x > top.reveal.x + screen.bounds.x);
  const topRight = resolvePosition(screen, { edge: "top", ratio: 1 });
  assert.ok(
    cardBounds(screen, topRight).x < topRight.reveal.x + screen.bounds.x,
  );
});
