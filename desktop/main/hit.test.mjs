import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink } from "../character/index.mjs";
import { grow, scanlines } from "../character/silhouette.mjs";
import { localPoint, pointerHit } from "./hit.mjs";

const MARGIN = 6;
const inside = (poly, p) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
};
function peek(edge) {
  const { window } = new JSDOM("<body><div id='h'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const blink = mountBlink(window.document.querySelector("#h"));
  globalThis.document = previous;
  for (let t = 0; t < 2; t += 1 / 60) blink.pose(t, { mode: "peek", edge });
  return blink;
}
// Displays as the Mac reports them: scale 1 and 2, a second display to the right
// of the first (non-zero origin), and a window the system kept below the menu bar.
const screens = [
  {
    name: "1x",
    display: { x: 0, y: 0, width: 1280, height: 800 },
    shift: 0,
  },
  {
    name: "2x with a second display origin",
    display: { x: 1440, y: -120, width: 1512, height: 982 },
    shift: 0,
  },
  {
    name: "window kept 25 px below the menu bar",
    display: { x: 0, y: 0, width: 1512, height: 982 },
    shift: 25,
  },
];

for (const edge of ["bottom", "top", "left", "right"])
  for (const screen of screens)
    test(`peek on the ${edge} edge, ${screen.name}: every drawn point reacts, the pointer 10 px past the margin does not`, () => {
      const blink = peek(edge);
      const shape = blink.polygons();
      const size = screen.display;
      const regions = grow(scanlines(blink.polygons(), size), MARGIN, size);
      // What the system reports for the window: it may sit lower than the display.
      const frame = {
        x: screen.display.x,
        y: screen.display.y + screen.shift,
      };
      let checked = 0;
      const r = blink.bodyRect();
      for (let x = r.x - 40; x <= r.x + r.width + 40; x += 2)
        for (let y = r.y - 40; y <= r.y + r.height + 60; y += 2) {
          const drawn = shape.some((poly) => inside(poly, { x, y }));
          if (!drawn) continue;
          // The pointer is in screen points: the window's frame plus the drawing's own pixel.
          const point = { x: frame.x + x, y: frame.y + y };
          const { onBlink, hit } = pointerHit({
            point,
            frame,
            regions,
            blinkRegions: regions,
          });
          assert.ok(hit && onBlink, `drawn ${x},${y} does not react`);
          checked++;
        }
      assert.ok(checked > 100, "Blink is drawn at the peek");
      // Far outside, no reaction: the nearest drawn pixel is at least 10 px beyond the margin.
      const far = { x: frame.x + size.width / 2, y: frame.y + size.height / 2 };
      const near = shape.some((poly) =>
        poly.some(
          (p) =>
            Math.hypot(p.x - size.width / 2, p.y - size.height / 2) <
            MARGIN + 10,
        ),
      );
      if (!near)
        assert.equal(
          pointerHit({ point: far, frame, regions, blinkRegions: regions }).hit,
          false,
        );
    });

test("the origin is the window frame: a window kept 25 px lower shifts the answer by exactly 25 px", () => {
  const regions = [{ x: 100, y: 100, width: 20, height: 1 }];
  const point = { x: 110, y: 100 };
  assert.equal(pointerHit({ point, frame: { x: 0, y: 0 }, regions }).hit, true);
  assert.equal(
    pointerHit({ point, frame: { x: 0, y: 25 }, regions }).hit,
    false,
  );
  assert.deepEqual(localPoint({ x: 110, y: 125 }, { x: 0, y: 25 }), point);
});

test("while Blink is out, the peek rim still counts as Blink", () => {
  const rim = [{ x: 0, y: 0, width: 10, height: 10 }];
  const args = {
    point: { x: 5, y: 5 },
    frame: { x: 0, y: 0 },
    regions: [],
    rim,
  };
  assert.equal(pointerHit({ ...args, out: true }).onBlink, true);
  assert.equal(pointerHit({ ...args, out: false }).onBlink, false);
});
