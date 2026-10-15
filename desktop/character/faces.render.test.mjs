import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink } from "./index.mjs";
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
