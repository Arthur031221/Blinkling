import test from "node:test";
import assert from "node:assert/strict";
import { menuLayout, menuTransform } from "./layout.mjs";
import { resolvePosition } from "../main/placement.mjs";
const overlap = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
test("the fan direction stays stable while a spring settles at the midpoint", () => {
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  const directions = [-0.0001, 0, 0.0001].map((offset) =>
    menuLayout(area, { x: 640 + offset, y: 600 }, 3).map((r) => r.direction),
  );
  assert.deepEqual(directions[0], directions[1]);
  assert.deepEqual(directions[1], directions[2]);
});
test("opening, closing and widened pills stay inside every display during spring overshoot", () => {
  for (const scale of [1, 1.5, 2]) {
    const area = { x: 0, y: 0, width: 1280 / scale, height: 800 / scale };
    for (const x of [0, area.width / 2, area.width])
      for (const y of [0, area.height / 2, area.height]) {
        const anchor = { x, y };
        for (let expanded = -1; expanded < 8; expanded++)
          for (const rect of menuLayout(area, anchor, expanded))
            for (const value of [0, 0.2, 0.8, 1, 1.05, 1.2]) {
              const pose = menuTransform(area, anchor, rect, value);
              const left =
                rect.x + pose.x - ((pose.scale - 1) * rect.width) / 2;
              const top =
                rect.y + pose.y - ((pose.scale - 1) * rect.height) / 2;
              assert.ok(left >= area.x + 8 - 1e-8);
              assert.ok(top >= area.y + 8 - 1e-8);
              assert.ok(
                left + rect.width * pose.scale <=
                  area.x + area.width - 8 + 1e-8,
              );
              assert.ok(
                top + rect.height * pose.scale <=
                  area.y + area.height - 8 + 1e-8,
              );
            }
      }
  }
});
for (const scale of [1, 1.5, 2])
  for (const edge of ["left", "right"])
    test(`all eight pills fit without overlap at ${scale * 100}%, ${edge} edge`, () => {
      const area = { x: 0, y: 0, width: 1280 / scale, height: 800 / scale };
      const anchor = {
        x: edge === "left" ? 90 : area.width - 90,
        y: area.height - 18,
      };
      for (let expanded = -1; expanded < 8; expanded++) {
        const rs = menuLayout(area, anchor, expanded);
        assert.equal(rs.length, 8);
        for (const [r, i] of rs.map((r, i) => [r, i])) {
          assert.ok(
            r.x >= 0 &&
              r.y >= 0 &&
              r.x + r.width <= area.width &&
              r.y + r.height <= area.height,
          );
          for (let j = i + 1; j < rs.length; j++)
            assert.equal(
              overlap(r, rs[j]),
              false,
              `${i},${j} expanded ${expanded}`,
            );
        }
      }
    });

const CLEAR = 12;
const inside = (r, area) =>
  r.x >= area.x + 8 - 1e-8 &&
  r.y >= area.y + 8 - 1e-8 &&
  r.x + r.width <= area.x + area.width - 8 + 1e-8 &&
  r.y + r.height <= area.y + area.height - 8 + 1e-8;
const apart = (a, b) =>
  a.x + a.width + CLEAR <= b.x + 1e-8 ||
  b.x + b.width + CLEAR <= a.x + 1e-8 ||
  a.y + a.height <= b.y + 1e-8 ||
  b.y + b.height <= a.y + 1e-8;
const displays = [
  [1280, 720],
  [1280, 680],
  [1280, 800],
];
const edges = ["left", "right", "top", "bottom"];

// Real anchors come from Blink's own placement on each edge, then the fan is
// asked for every pill expanded, and for every width a pill passes through on
// the way (the pill springs between narrow and wide while neighbours settle).
for (const [w, h] of displays)
  for (const scale of [1, 1.5, 2])
    test(`the fan never overlaps itself or leaves the work area on ${w}x${h} at ${scale * 100}%, all four edges`, () => {
      const display = {
        bounds: { x: 0, y: 0, width: w / scale, height: (h + 40) / scale },
        workArea: { x: 0, y: 0, width: w / scale, height: h / scale },
      };
      for (const edge of edges)
        for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
          const { reveal, area } = resolvePosition(display, { edge, ratio });
          for (const anchor of [reveal, { x: reveal.x + 3.3, y: reveal.y - 2.1 }])
            for (let expanded = -1; expanded < 8; expanded++)
              for (const wide of [42, 70, 117, 180, 252]) {
                const widths = Array.from({ length: 8 }, (_, i) =>
                  i === expanded ? wide : 42,
                );
                // A neighbour that is itself mid-transition.
                for (const other of [42, 150]) {
                  const mixed = widths.map((v, i) => (i === (expanded + 4) % 8 && expanded >= 0 ? other : v));
                  const rs = menuLayout(area, anchor, expanded, mixed);
                  rs.forEach((r, i) => {
                    assert.ok(inside(r, area), `${edge} ${ratio} pill ${i} leaves the area (${JSON.stringify(r)})`);
                    for (let j = i + 1; j < rs.length; j++)
                      assert.ok(
                        apart(r, rs[j]),
                        `${edge} ${ratio} expanded ${expanded} width ${wide}/${other}: ${i} meets ${j}`,
                      );
                  });
                }
              }
        }
    });

test("a collapsing pill keeps its neighbour clear at the width it has now", () => {
  const area = { x: 0, y: 0, width: 640, height: 340 };
  const anchor = { x: 90, y: 330 };
  const widths = [150, 42, 42, 42, 42, 42, 42, 42];
  const rs = menuLayout(area, anchor, -1, widths);
  assert.equal(rs[0].width, 150);
  assert.ok(apart(rs[0], rs[4]), "the row neighbour waits for the pill to finish shrinking");
});
