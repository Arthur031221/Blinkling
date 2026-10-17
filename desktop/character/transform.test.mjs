import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink } from "./index.mjs";
import { edgeTransform, poseTransform } from "./transform.mjs";

function rig() {
  const { window } = new JSDOM("<body><div id='h'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const blink = mountBlink(window.document.querySelector("#h"));
  globalThis.document = previous;
  return blink;
}

/** Applies an SVG transform list the way a renderer does: the last one first. */
function applyList(list, p) {
  const steps = [...list.matchAll(/(translate|rotate)\(([^)]*)\)/g)].map(
    ([, name, args]) => ({
      name,
      n: args
        .trim()
        .split(/[\s,]+/)
        .map(Number),
    }),
  );
  for (const { name, n } of steps.reverse()) {
    if (name === "translate") p = { x: p.x + n[0], y: p.y + (n[1] ?? 0) };
    else {
      const a = (n[0] * Math.PI) / 180,
        [cx, cy] = [n[1] ?? 0, n[2] ?? 0],
        dx = p.x - cx,
        dy = p.y - cy;
      p = {
        x: cx + dx * Math.cos(a) - dy * Math.sin(a),
        y: cy + dx * Math.sin(a) + dy * Math.cos(a),
      };
    }
  }
  return p;
}
/** Where the browser would put a marker drawn in the figure: every transform on
 * the way up from it, innermost first. */
function drawnAt(svg, selector, p) {
  let node = svg.querySelector(selector);
  while (node && node !== svg) {
    const t = node.getAttribute?.("transform");
    if (t) p = applyList(t, p);
    node = node.parentNode;
  }
  return p;
}

const MARKER = { x: 62, y: 54 };
const POSES = {
  out: { mode: "out" },
  peek: { mode: "peek" },
  held: { mode: "drag", velocity: 600 },
  whirl: { mode: "drag", whirlAt: 0 },
  walk: { walking: 1 },
  drop: { mode: "drop" },
  dizzy: { dizzyAt: 1.5 },
  celebrate: { celebrateAt: 1.5 },
  gaze: { gaze: { x: 100, y: -50 } },
  costume: { costumeAt: 1.5, costume: { family: "opus", effort: "max" } },
};

for (const edge of ["bottom", "top", "left", "right"])
  for (const [name, o] of Object.entries(POSES))
    test(`${name} on the ${edge} edge: the drawing and the hit test place a point alike`, () => {
      const blink = rig();
      let worst = 0;
      for (let t = 1; t < 3; t += 1 / 20) {
        blink.pose(t, { edge, dot: "retrying", ...o });
        const drawn = drawnAt(blink.svg, ".status", MARKER);
        const hit = blink.figurePoint(MARKER);
        worst = Math.max(worst, Math.hypot(drawn.x - hit.x, drawn.y - hit.y));
      }
      assert.ok(worst < 1e-6, `${name}/${edge} differ by ${worst}`);
    });

test("the transforms round to one decimal in the drawing and in the hit test alike", () => {
  const pose = poseTransform({
    x: 1.26,
    y: -3.04,
    roll: 7.77,
    pivot: [100, 34],
  });
  assert.equal(pose.svg, "translate(1.3 -3) rotate(7.8 100 34)");
  const edge = edgeTransform({ x: 100.04, y: 80.96, angle: -90 }, 100, 150);
  assert.equal(edge.svg, "translate(100 81) rotate(-90) translate(-100 -150)");
  const p = edge.apply({ x: 100, y: 150 });
  assert.deepEqual([p.x, p.y], [100, 81]);
});
