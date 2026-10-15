import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink, DIZZY_FOR, CATCH_FOR } from "./index.mjs";
import { FACES } from "./face.mjs";

function rig() {
  const { window } = new JSDOM("<body><div id='h'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const blink = mountBlink(window.document.querySelector("#h"));
  globalThis.document = previous;
  return blink;
}
// Everything that can differ between faces; the body and limbs stay identical.
const look = (blink) =>
  [
    blink.rig.face.node,
    blink.rig.eyes.node,
    blink.rig.pupils.node,
    blink.rig.mouth,
  ]
    .map((n) => n.outerHTML)
    .join("|");
// A moment with open eyes, no wave, a round mouth opening.
const T = 0.1;

test("every face looks different from idle and from every other face", () => {
  const seen = new Map();
  for (const face of FACES) {
    const blink = rig();
    blink.pose(T, { face });
    const key = look(blink);
    assert.ok(!seen.has(key), `${face} looks like ${seen.get(key)}`);
    seen.set(key, face);
  }
});

test("the connection dot is hidden unless the connection is in trouble", () => {
  const blink = rig();
  blink.pose(T, { dot: null });
  assert.equal(blink.rig.status.getAttribute("visibility"), "hidden");
  for (const dot of ["retrying", "blocked"]) {
    blink.pose(T, { dot });
    assert.equal(blink.rig.status.getAttribute("visibility"), "visible");
    assert.equal(blink.rig.status.dataset.connection, dot);
  }
  blink.pose(T, { dot: null });
  assert.equal(blink.rig.status.getAttribute("visibility"), "hidden");
});

test("a catch bounces Blink and opens its mouth, then settles", () => {
  const blink = rig();
  blink.pose(T, { face: "idle" });
  const rest = blink.rig.mouth.getAttribute("opacity");
  blink.pose(5.1, { face: "idle", catchAt: 5 });
  assert.equal(blink.rig.mouth.getAttribute("opacity"), "1");
  assert.equal(rest, "0");
  blink.pose(7, { face: "idle", catchAt: 5 });
  assert.equal(blink.rig.mouth.getAttribute("opacity"), "0");
  assert.equal(blink.rig.mouth.getAttribute("transform"), null);
});

test("a catch is a big reaction: a wide gulp, chewing that fades, puffed cheeks and a high hop", () => {
  const blink = rig();
  blink.pose(5.05, { face: "idle", catchAt: 5 });
  const gape = (at) =>
    Number(
      /scale\(([\d.]+),([\d.]+)\)/.exec(
        (blink.pose(at, { face: "idle", catchAt: 5 }),
        blink.rig.mouth.getAttribute("transform")),
      )[2],
    );
  assert.ok(gape(5.05) > 1.5, "gapes wide when it catches");
  const chews = [];
  for (let t = 5.3; t < 5 + CATCH_FOR * 0.7; t += 0.02) chews.push(gape(t));
  assert.ok(
    Math.max(...chews) - Math.min(...chews) > 0.1,
    "the mouth works back and forth",
  );
  blink.pose(5.1, { face: "idle", catchAt: 5 });
  assert.ok(blink.rig.cheeks[0].getAttribute("transform").includes("scale(1."));
  let top = 0;
  for (let t = 5; t < 5 + CATCH_FOR; t += 0.01) {
    blink.pose(t, { face: "idle", catchAt: 5 });
    top = Math.max(
      top,
      -Number(
        /translate\(0,(-?[\d.]+)\)/.exec(
          blink.rig.root.node.parentNode.getAttribute("transform"),
        )[1],
      ),
    );
  }
  assert.ok(top > 20, `hop ${top}`);
  blink.pose(5 + CATCH_FOR + 0.1, { face: "idle", catchAt: 5 });
  assert.equal(blink.rig.mouth.getAttribute("opacity"), "0");
  assert.equal(blink.rig.cheeks[0].getAttribute("transform"), null);
});

test("a held Blink is nervous, not stretched: it trembles, sweats and keeps its shape", () => {
  const blink = rig();
  blink.pose(T, { mode: "peek" });
  assert.equal(blink.rig.sweat.getAttribute("opacity"), "0");
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    blink.pose(T + i * 0.013, { mode: "drag", velocity: 0 });
    assert.ok(Number(blink.rig.sweat.getAttribute("opacity")) > 0);
    assert.equal(blink.rig.brows.getAttribute("opacity"), "1");
    assert.ok(blink.rig.root.sx > 0.95 && blink.rig.root.sx < 1.08);
    assert.ok(blink.rig.root.sy > 0.95 && blink.rig.root.sy < 1.08);
    seen.add(blink.rig.root.r.toFixed(2));
  }
  assert.ok(seen.size > 6, "the wobble moves");
  blink.pose(T + 1, { mode: "peek" });
  assert.equal(blink.rig.sweat.getAttribute("opacity"), "0");
});

test("a dizzy Blink shows spiral eyes and stars, sways, then recovers", () => {
  const blink = rig();
  blink.pose(10.5, { dizzyAt: 10 });
  assert.ok(blink.rig.spirals.every((s) => s.getAttribute("opacity") === "1"));
  assert.ok(blink.rig.stars.every((s) => s.getAttribute("opacity") === "1"));
  assert.ok(Math.abs(blink.rig.root.r) > 0);
  blink.pose(10 + DIZZY_FOR + 0.1, { dizzyAt: 10 });
  assert.ok(blink.rig.spirals.every((s) => s.getAttribute("opacity") === "0"));
  assert.ok(blink.rig.stars.every((s) => s.getAttribute("opacity") === "0"));
  assert.equal(blink.rig.root.r, 0);
});

test("each touched body part gets its own reaction and release restores Blink", () => {
  const looks = new Map();
  for (const part of ["head", "cheek", "belly", "hand", "foot"]) {
    const blink = rig();
    blink.pose(T, { touch: { part, side: -1 } });
    const key = [
      look(blink),
      blink.rig.root.node.getAttribute("transform"),
      blink.rig.arms.L.shoulder.node.getAttribute("transform"),
      blink.rig.legs.L.hip.node.getAttribute("transform"),
      blink.rig.heart.getAttribute("opacity"),
      blink.rig.cheeks[0].getAttribute("transform"),
    ].join("|");
    assert.ok(!looks.has(key), `${part} looks like ${looks.get(key)}`);
    looks.set(key, part);
    blink.pose(T, { touch: null });
    assert.equal(blink.rig.heart.getAttribute("opacity"), "0");
    assert.equal(blink.rig.cheeks[0].getAttribute("transform"), null);
  }
});

test("a held Blink ignores a touch", () => {
  const a = rig();
  const b = rig();
  a.pose(T, { mode: "drag" });
  b.pose(T, { mode: "drag", touch: { part: "head", side: 1 } });
  assert.equal(look(a), look(b));
});

test("while picking, Blink's pupils follow the cursor and its eyes widen, and it stops when picking ends", () => {
  const plain = rig();
  const left = rig();
  const right = rig();
  const below = rig();
  plain.pose(T, {});
  left.pose(T, { gaze: { x: -1, y: 0 } });
  right.pose(T, { gaze: { x: 1, y: 0 } });
  below.pose(T, { gaze: { x: 0, y: 1 } });
  assert.ok(left.rig.pupils.x < -5, "looks left");
  assert.ok(right.rig.pupils.x > 5, "looks right");
  assert.ok(below.rig.pupils.y > 4, "looks down");
  assert.ok(left.rig.eyes.sx > plain.rig.eyes.sx, "eyes widen");
  left.pose(T, { gaze: null });
  assert.equal(look(left), look(plain));
});

test("a held, dizzy or touched Blink is not pulled to the cursor", () => {
  const gaze = { x: 1, y: 1 };
  const held = rig();
  const heldPlain = rig();
  held.pose(T, { mode: "drag", gaze });
  heldPlain.pose(T, { mode: "drag" });
  assert.equal(look(held), look(heldPlain));
  const dizzy = rig();
  dizzy.pose(10.5, { dizzyAt: 10, gaze });
  assert.equal(dizzy.rig.pupils.x, 0);
  const touched = rig();
  touched.pose(T, { touch: { part: "cheek", side: -1 }, gaze });
  assert.equal(touched.rig.pupils.x, -8);
});
