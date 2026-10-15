import test from "node:test";
import assert from "node:assert/strict";
import { menuLayout, menuTransform, PILL } from "./layout.mjs";
import { resolvePosition } from "../main/placement.mjs";
const overlap = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
/** The bubble plus the room its label unfolds into. */
const footprint = (r) => ({
  ...r,
  x: r.direction > 0 ? r.x : r.x - PILL.label,
  width: r.width + PILL.label,
});
const inside = (r, area) =>
  r.x >= area.x + 8 - 1e-8 &&
  r.y >= area.y + 8 - 1e-8 &&
  r.x + r.width <= area.x + area.width - 8 + 1e-8 &&
  r.y + r.height <= area.y + area.height - 8 + 1e-8;
const edges = ["left", "right", "top", "bottom"];
const ratios = [0, 0.25, 0.5, 0.75, 1];
const displays = [
  [683, 450],
  [1280, 680],
  [1280, 720],
  [1280, 800],
];

test("the menu is five bubbles of one fixed size, four on a display too short for five", () => {
  const rs = menuLayout(
    { x: 0, y: 0, width: 1280, height: 800 },
    { x: 1190, y: 704 },
  );
  assert.equal(rs.length, 5);
  for (const r of rs) {
    assert.equal(r.width, PILL.size);
    assert.equal(r.height, PILL.size);
  }
  assert.equal(
    menuLayout({ x: 0, y: 0, width: 683, height: 225 }, { x: 600, y: 200 })
      .length,
    4,
  );
});

test("the fan direction stays stable while a spring settles at the midpoint", () => {
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  const directions = [-0.0001, 0, 0.0001].map((offset) =>
    menuLayout(area, { x: 640 + offset, y: 600 }).map((r) => r.direction),
  );
  assert.deepEqual(directions[0], directions[1]);
  assert.deepEqual(directions[1], directions[2]);
});

test("opening and closing stay inside every display during spring overshoot", () => {
  for (const scale of [1, 1.5, 2]) {
    const area = { x: 0, y: 0, width: 1280 / scale, height: 800 / scale };
    for (const x of [0, area.width / 2, area.width])
      for (const y of [0, area.height / 2, area.height]) {
        const anchor = { x, y };
        for (const rect of menuLayout(area, anchor))
          for (const value of [0, 0.2, 0.8, 1, 1.05, 1.2]) {
            const pose = menuTransform(area, anchor, rect, value);
            const left = rect.x + pose.x - ((pose.scale - 1) * rect.width) / 2;
            const top = rect.y + pose.y - ((pose.scale - 1) * rect.height) / 2;
            assert.ok(left >= area.x + 8 - 1e-8);
            assert.ok(top >= area.y + 8 - 1e-8);
            assert.ok(
              left + rect.width * pose.scale <= area.x + area.width - 8 + 1e-8,
            );
            assert.ok(
              top + rect.height * pose.scale <= area.y + area.height - 8 + 1e-8,
            );
          }
      }
  }
});

// Real anchors come from Blink's own placement on each edge, plus the small
// offsets a spring passes through on the way there.
for (const [w, h] of displays)
  for (const scale of [1, 1.5, 2])
    test(`the fan fits without overlap on ${w}x${h} at ${scale * 100}%, all four edges`, () => {
      const display = {
        bounds: { x: 0, y: 0, width: w / scale, height: (h + 40) / scale },
        workArea: { x: 0, y: 0, width: w / scale, height: h / scale },
      };
      for (const edge of edges)
        for (const ratio of ratios) {
          const { reveal, area } = resolvePosition(display, { edge, ratio });
          for (const anchor of [
            reveal,
            { x: reveal.x + 3.3, y: reveal.y - 2.1 },
          ]) {
            const rs = menuLayout(area, anchor);
            rs.forEach((r, i) => {
              const label = `${edge} ${ratio} bubble ${i}`;
              assert.ok(inside(r, area), `${label} leaves the area`);
              assert.ok(
                inside(footprint(r), area),
                `${label}: its label leaves the area`,
              );
              for (let j = i + 1; j < rs.length; j++)
                assert.equal(
                  overlap(footprint(r), footprint(rs[j])),
                  false,
                  `${label} meets ${j}`,
                );
            });
          }
        }
    });

test("the fan opens above Blink when there is room and below it at the top edge", () => {
  const display = {
    bounds: { x: 0, y: 0, width: 1280, height: 800 },
    workArea: { x: 0, y: 0, width: 1280, height: 800 },
  };
  const bottom = resolvePosition(display, { edge: "right", ratio: 0.88 });
  for (const r of menuLayout(bottom.area, bottom.reveal))
    assert.ok(r.y + r.height <= bottom.reveal.y - 124, "above Blink's head");
  const top = resolvePosition(display, { edge: "top", ratio: 0.5 });
  for (const r of menuLayout(top.area, top.reveal))
    assert.ok(r.y >= top.reveal.y, "below Blink at the top edge");
});

test("bubbles never sit on Blink's body while the fan has room", () => {
  const display = {
    bounds: { x: 0, y: 0, width: 683, height: 450 },
    workArea: { x: 0, y: 0, width: 683, height: 450 },
  };
  for (const edge of edges)
    for (const ratio of ratios) {
      const { reveal, area } = resolvePosition(display, { edge, ratio });
      const body = {
        x: reveal.x - 74,
        y: reveal.y - 124,
        width: 148,
        height: 130,
      };
      for (const r of menuLayout(area, reveal))
        assert.equal(overlap(r, body), false, `${edge} ${ratio}`);
    }
});
