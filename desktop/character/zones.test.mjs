import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink } from "./index.mjs";

function rig() {
  const { window } = new JSDOM("<body><div id='h'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const blink = mountBlink(window.document.querySelector("#h"));
  globalThis.document = previous;
  return blink;
}
/** Plays `o` for two seconds so the pose has settled. */
function settle(mode, edge, extra = {}) {
  const blink = rig();
  let t = 0;
  for (; t < 2; t += 1 / 60) blink.pose(t, { mode, edge, ...extra });
  return { blink, t };
}
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
const drawn = (blink, p) => blink.polygons().some((poly) => inside(poly, p));
const grid = (blink) => {
  const r = blink.bodyRect(),
    out = [];
  for (let x = r.x - 60; x <= r.x + r.width + 60; x += 3)
    for (let y = r.y - 60; y <= r.y + r.height + 100; y += 3)
      out.push({ x, y });
  return out;
};

for (const edge of ["bottom", "top", "left", "right"])
  for (const mode of ["out", "peek"])
    test(`${mode} on the ${edge} edge: a part is touched exactly where Blink is drawn`, () => {
      const { blink } = settle(mode, edge);
      let hits = 0;
      for (const p of grid(blink)) {
        const part = blink.touchAt(p);
        if (part) hits += 1;
        if (part && part.part !== "cheek")
          assert.ok(
            drawn(blink, p),
            `${part.part} at ${p.x},${p.y} is not on a drawn shape`,
          );
        if (drawn(blink, p))
          assert.ok(part, `drawn point ${p.x},${p.y} touches nothing`);
      }
      assert.ok(hits > 50, "something is touchable");
    });

test("the body names its head above the face line and its belly below", () => {
  const { blink } = settle("out", "bottom");
  const parts = new Set(grid(blink).map((p) => blink.touchAt(p)?.part));
  for (const name of ["head", "belly", "cheek", "hand", "foot"])
    assert.ok(parts.has(name), `${name} is reachable`);
});

test("a raised arm is touched where it is drawn, not where it hangs", () => {
  const { blink, t } = settle("out", "bottom");
  const before = new Set(
    grid(blink)
      .filter((p) => blink.touchAt(p)?.part === "hand")
      .map((p) => `${p.x},${p.y}`),
  );
  let now = t;
  for (let i = 0; i < 90; i++) {
    now += 1 / 60;
    blink.pose(now, { mode: "out", edge: "bottom", celebrateAt: t });
  }
  const after = grid(blink).filter((p) => blink.touchAt(p)?.part === "hand");
  assert.ok(after.length > 10);
  assert.ok(
    after.some((p) => !before.has(`${p.x},${p.y}`)),
    "the hand zone moved with the arm",
  );
  for (const p of after) assert.ok(drawn(blink, p));
});

test("the hand on the left is side -1 and the other +1", () => {
  const { blink } = settle("out", "bottom");
  const hands = grid(blink).filter((p) => blink.touchAt(p)?.part === "hand");
  const r = blink.bodyRect(),
    mid = r.x + r.width / 2;
  for (const p of hands)
    assert.equal(blink.touchAt(p).side, p.x < mid ? -1 : 1);
});

test("the guide stick is masked for the screen watch but takes no click", () => {
  const { blink } = settle("out", "bottom", { guideAim: { x: 1, y: -0.4 } });
  const still = settle("out", "bottom").blink;
  assert.deepEqual(still.ornaments(), []);
  const [stick] = blink.ornaments();
  assert.ok(stick.length > 8, "the stick has an outline");
  // The ball at the end of the stick, wherever the tap has it, is inside.
  const m = blink.last.attach.match(
    /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="5"/,
  );
  const [vx, vy] = blink.svg.getAttribute("viewBox").split(" ").map(Number);
  const at = blink.figurePoint({ x: Number(m[1]), y: Number(m[2]) });
  const ball = { x: at.x - vx, y: at.y - vy };
  assert.ok(inside(stick, ball), "the ball is inside the mask");
  // It is not a hit region: the pointer goes through it.
  assert.equal(drawn(blink, ball), false);
  assert.equal(blink.touchAt(ball), null);
});
