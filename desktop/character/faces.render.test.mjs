import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink, DIZZY_FOR } from "./index.mjs";
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
