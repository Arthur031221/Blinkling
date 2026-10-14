import test from "node:test";
import assert from "node:assert/strict";
import { menuLayout } from "./layout.mjs";
const overlap = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
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
