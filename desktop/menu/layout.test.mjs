import test from "node:test";
import assert from "node:assert/strict";
import { menuLayout, menuTransform } from "./layout.mjs";
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
