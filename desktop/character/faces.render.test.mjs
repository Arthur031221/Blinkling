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
const look = (blink) => blink.svg.innerHTML;
const SWEAT = "#9fd8ff";
const STAR = "#ffd25e";
// A moment with open eyes and no wave.
const T = 0.1;
/** Plays a pose for a while so that its blend has finished. */
function settle(blink, from, o, seconds = 1) {
  for (let t = from; t <= from + seconds; t += 1 / 30) blink.pose(t, o);
  return from + seconds;
}

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
  assert.ok(!look(blink).includes('class="status"'));
  for (const dot of ["retrying", "blocked"]) {
    blink.pose(T, { dot });
    assert.ok(look(blink).includes(`data-connection="${dot}"`));
  }
  blink.pose(T, { dot: null });
  assert.ok(!look(blink).includes('class="status"'));
});

test("a held Blink is nervous: it trembles, sweats and never changes its shape", () => {
  const blink = rig();
  blink.pose(T, {});
  assert.ok(!look(blink).includes(SWEAT));
  const rolls = new Set();
  for (let i = 0; i < 40; i++) {
    blink.pose(T + i * 0.04, { mode: "drag", velocity: 0 });
    rolls.add(blink.last.roll.toFixed(2));
    assert.ok(look(blink).includes(SWEAT), "sweats while held");
    if (i > 8) assert.equal(blink.last.eyes, "wide");
    assert.ok(Math.abs(blink.last.roll) < 15, "swings, never stretches");
    assert.equal(blink.last.yaw, 0);
  }
  assert.ok(rolls.size > 6, "the wobble moves");
  settle(blink, T + 2, {});
  assert.ok(!look(blink).includes(SWEAT));
});

test("a dizzy Blink shows spiral eyes and stars, sways, then recovers", () => {
  const blink = rig();
  blink.pose(10.5, { dizzyAt: 10 });
  assert.equal(blink.last.eyes, "dizzy");
  assert.equal((look(blink).match(new RegExp(STAR, "g")) ?? []).length, 3);
  assert.ok(Math.abs(blink.last.roll) > 0);
  settle(blink, 10.5, { dizzyAt: 10 }, DIZZY_FOR + 0.2 - 0.5);
  assert.notEqual(blink.last.eyes, "dizzy");
  assert.ok(!look(blink).includes(STAR), "the stars are gone");
  settle(blink, 10 + DIZZY_FOR + 0.3, { dizzyAt: 10 });
  assert.ok(Math.abs(blink.last.roll) < 0.05, "it stands still again");
});

test("each touched body part gets its own reaction and release restores Blink", () => {
  const looks = new Map();
  const plain = rig();
  plain.pose(T, {});
  for (const part of ["head", "cheek", "belly", "hand", "foot"]) {
    const blink = rig();
    blink.pose(T, { touch: { part, side: -1 } });
    const key = look(blink);
    assert.ok(!looks.has(key), `${part} looks like ${looks.get(key)}`);
    looks.set(key, part);
    assert.notEqual(key, look(plain), `${part} looks like standing`);
    settle(blink, T + 0.1, { touch: null });
    assert.equal(blink.last.eyes, plain.last.eyes);
    assert.equal(blink.last.mouth, plain.last.mouth);
  }
});

test("a held Blink ignores a touch", () => {
  const a = rig();
  const b = rig();
  a.pose(T, { mode: "drag" });
  b.pose(T, { mode: "drag", touch: { part: "head", side: 1 } });
  assert.equal(look(a), look(b));
});

test("while picking, Blink's eyes follow the cursor and it stops when picking ends", () => {
  const plain = rig();
  const left = rig();
  const right = rig();
  const below = rig();
  plain.pose(T, {});
  left.pose(T, { gaze: { x: -1, y: 0 } });
  right.pose(T, { gaze: { x: 1, y: 0 } });
  below.pose(T, { gaze: { x: 0, y: 1 } });
  assert.ok(left.last.look[0] < -0.5, "looks left");
  assert.ok(right.last.look[0] > 0.5, "looks right");
  assert.ok(below.last.look[1] > 0.5, "looks down");
  assert.ok(left.last.yaw < 0 && right.last.yaw > 0, "the body turns with it");
  settle(left, T + 0.05, { gaze: null });
  assert.ok(Math.abs(left.last.yaw) < 0.5);
  assert.notDeepEqual(left.last.look, [-1, 0]);
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
  assert.equal(dizzy.last.yaw, 0);
  assert.equal(dizzy.last.eyes, "dizzy");
  const touched = rig();
  touched.pose(T, { touch: { part: "cheek", side: -1 }, gaze });
  assert.equal(touched.last.yaw, 0);
  assert.equal(touched.last.eyes, "squeeze");
});
