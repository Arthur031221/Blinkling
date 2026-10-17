import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { BOX, FEET, mountBlink } from "../character/index.mjs";
import { BLINK_SCALE as K } from "../character/size.mjs";
import { grow, scanlines } from "../character/silhouette.mjs";
import { pointerHit } from "./hit.mjs";

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
const toSegment = (p, a, b) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    k = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
};
const away = (poly, p) =>
  Math.min(...poly.map((a, i) => toSegment(p, a, poly[(i + 1) % poly.length])));
// What a real page reports: the drawing's units are K CSS pixels each, laid out in
// the window with Blink's feet on the box's foot point.
function figure(edge, o) {
  const { window } = new JSDOM("<body><div id='h'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const blink = mountBlink(window.document.querySelector("#h"));
  globalThis.document = previous;
  const x0 = FEET.x - BOX.footX / K,
    y0 = FEET.y - BOX.footY / K;
  blink.svg.getScreenCTM = () => ({
    a: K,
    b: 0,
    c: 0,
    d: K,
    e: -x0 * K,
    f: -y0 * K,
  });
  for (let t = 0; t < 3; t += 1 / 60) blink.pose(t, { edge, ...o });
  return blink;
}
const POSES = {
  out: { mode: "out" },
  peek: { mode: "peek" },
  held: { mode: "drag", velocity: 500 },
  walk: { walking: 1 },
  celebrate: { celebrateAt: 1.5 },
  costume: { costumeAt: 1.5, costume: { family: "fable", effort: "high" } },
};
// Scale 1 and 2; the work area starts at the top of the display, 25 points lower
// under a short menu bar, or 38 points lower under a tall one.
const SCALES = [1, 2];
const ORIGINS = [
  { x: 0, y: 0 },
  { x: 0, y: 25 },
  { x: 0, y: 38 },
];
const size = { width: BOX.width, height: BOX.height };

for (const edge of ["bottom", "top", "left", "right"])
  for (const [name, o] of Object.entries(POSES))
    for (const scale of SCALES)
      for (const origin of ORIGINS)
        test(`${name} on the ${edge} edge at ${scale}x, work area at ${origin.x},${origin.y}: the pointer reacts where Blink is drawn and not beyond its margin`, () => {
          const blink = figure(edge, o);
          const shape = blink.polygons();
          const regions = grow(scanlines(shape, size), MARGIN, size);
          // The window sits at the bottom of the work area; it is the origin of the drawing.
          const frame = { x: 800 + origin.x, y: 300 + origin.y };
          let checked = 0;
          for (let x = 0; x < size.width; x += 4)
            for (let y = 0; y < size.height; y += 4) {
              // What the system reports for the pointer: points on a Mac, device pixels on
              // X11 and Windows, which main turns into points by the display's scale.
              const device = {
                x: (frame.x + x) * scale,
                y: (frame.y + y) * scale,
              };
              const point = { x: device.x / scale, y: device.y / scale };
              const drawn = shape.some((p) => inside(p, { x, y }));
              const { hit } = pointerHit({
                point,
                frame,
                regions,
                blinkRegions: regions,
              });
              if (drawn) {
                assert.ok(hit, `drawn ${x},${y} does not react`);
                checked++;
              }
              // Well away from every drawn point, nothing reacts.
              const far =
                !drawn && shape.every((p) => away(p, { x, y }) > MARGIN + 3);
              if (far) assert.ok(!hit, `${x},${y} reacts far from Blink`);
            }
          assert.ok(checked > 20, `${name} is drawn on ${edge}`);
        });
