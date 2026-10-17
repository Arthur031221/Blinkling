import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink } from "./index.mjs";
import {
  APPEAR_FOR,
  CELEBRATE_FOR,
  EAT_FOR,
  EAT_SWALLOWED,
  FILE_FOR,
  LEAVE_FOR,
  SHRUG_FOR,
  TURN_FOR,
  appearing,
  celebrating,
  eating,
  fileCaught,
  leaving,
  picking,
  guiding,
  shrugging,
  turning,
  walking,
  whirled,
} from "./motions.mjs";

function rig() {
  const { window } = new JSDOM("<body><div id='h'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const blink = mountBlink(window.document.querySelector("#h"));
  globalThis.document = previous;
  return blink;
}
const STAR = "#ffd25e";
/** Plays `o` at `t0 + k` for k from 0 to `seconds`, calling `each(k)` after each frame. */
function play(blink, t0, o, seconds, each) {
  for (let k = 0; k <= seconds + 1e-9; k += 1 / 60) {
    blink.pose(t0 + k, o(k));
    each?.(k);
  }
}

test("eating follows the sheet: mouth wide, the picture sucked in, chew, gulp, sparkle", () => {
  const at = (k) => eating(k);
  assert.equal(at(0.2).mouth, "gulp");
  assert.ok(at(0.4).mp > 0.95, "the mouth is wide when the picture arrives");
  assert.deepEqual(at(0.6).L, [100, 30, 130, 30], "hands up to the mouth");
  assert.equal(at(0.6).eyes, "squeeze", "eyes shut while it is sucked in");
  assert.equal(at(1.7).mouth, "chew");
  const chews = [];
  for (let k = 1.6; k < 2.4; k += 0.02) chews.push(at(k).mp);
  assert.ok(Math.max(...chews) - Math.min(...chews) > 0.8, "the mouth works");
  assert.equal(at(1.7).blush, 1.35);
  const hop = Math.min(...[2.45, 2.55, 2.65].map((k) => at(k).y));
  assert.ok(hop <= -2.5, `swallow hop ${hop}`);
  assert.ok(at(3.0).faceExtra.includes(STAR), "a sparkle follows the gulp");
  assert.ok(!at(EAT_FOR).faceExtra.includes("NaN"));
  assert.equal(at(EAT_FOR - 0.01).mouth, "smile");
});

test("an eat plays in the drawing and then gives the face back", () => {
  const blink = rig();
  blink.pose(0.1, { face: "idle" });
  const rest = blink.last.mouth;
  const seen = new Set();
  play(
    blink,
    5,
    () => ({ face: "idle", eatAt: 5 }),
    EAT_FOR,
    () => seen.add(blink.last.mouth),
  );
  for (const m of ["gulp", "chew"]) assert.ok(seen.has(m), m);
  play(blink, 5 + EAT_FOR + 0.01, () => ({ face: "idle", eatAt: 5 }), 1);
  assert.equal(blink.last.mouth, rest);
  assert.ok(!blink.svg.innerHTML.includes(STAR));
});

test("appearing drops from above, bounces, then waves", () => {
  assert.ok(appearing(0.05).y < -200 && appearing(0.05).eyes === "wide");
  assert.ok(appearing(0.5).y === 0);
  assert.ok(appearing(0.7).y < -10, "bounce");
  assert.equal(appearing(2).eyes, "happy");
  const hands = new Set(
    [2, 2.1, 2.2, 2.3].map((k) => appearing(k).R[2].toFixed(1)),
  );
  assert.ok(hands.size > 2, "the hand waves");
  assert.equal(appearing(APPEAR_FOR - 0.1).eyes, "open");
});

test("leaving waves goodbye, jumps up and out of the picture", () => {
  assert.equal(leaving(0.5).eyes, "happy");
  assert.ok(leaving(1.9).y < -80, "in the air");
  assert.deepEqual(leaving(1.9).L, [150, 10, 172, 10]);
  assert.equal(leaving(LEAVE_FOR).y, -400);
});

test("turning swings the body out to the side and back, eyes following", () => {
  assert.equal(turning(0, 1).yaw, 0);
  assert.ok(Math.abs(turning(TURN_FOR / 2, 1).yaw - 38) < 1e-6);
  assert.ok(Math.abs(turning(TURN_FOR / 2, -1).yaw + 38) < 1e-6);
  assert.ok(Math.abs(turning(TURN_FOR, 1).yaw) < 1e-6);
  assert.ok(turning(TURN_FOR / 2, 1).look[0] > 0.7);
});

test("walking swings legs and arms in step, bobs, and leans into the walk", () => {
  const a = walking(0.05, 1),
    b = walking(0.05, -1);
  assert.equal(a.yaw, 30);
  assert.equal(b.yaw, -30);
  assert.ok(
    Math.abs(a.legL[1]) > 5 && a.legL[1] === -a.legR[1],
    "legs alternate",
  );
  assert.equal(a.legL[1], -b.legL[1], "mirrored for the other way");
  const ys = [0, 0.05, 0.1, 0.15, 0.2].map((t) => walking(t).y);
  assert.ok(Math.min(...ys) < -1.5 && Math.max(...ys) <= 0, "bobs");
});

test("holding the pick key turns Blink toward the screen with one hand raised", () => {
  const p = picking(1);
  assert.equal(p.yaw, 18);
  assert.deepEqual(p.R, [95, 5, 98, 0]);
  const blink = rig();
  play(blink, 1, () => ({ picking: true, gaze: { x: -1, y: 0 } }), 1);
  assert.equal(blink.last.yaw, 18);
  assert.ok(blink.last.look[0] < -0.9, "the eyes follow the pointer");
});

test("a dropped file falls onto Blink's head and it sways under it", () => {
  assert.ok(fileCaught(0.2).attach.includes("opacity"));
  const early = fileCaught(0.6).attach,
    late = fileCaught(1.6).attach;
  assert.notEqual(early, late);
  assert.equal(fileCaught(0.2).eyes, "wide");
  assert.equal(fileCaught(2).eyes, "happy");
  assert.ok(
    fileCaught(FILE_FOR - 0.01).attach.includes('opacity="0'),
    "fades away",
  );
});

test("celebrating jumps with both hands up and bursts into stars", () => {
  const ys = [];
  for (let k = 0; k < CELEBRATE_FOR; k += 0.02) ys.push(celebrating(k).y);
  assert.ok(Math.min(...ys) <= -39, `jump ${Math.min(...ys)}`);
  assert.ok(
    celebrating(0.7).front.split("<path").length - 1 === 5,
    "five stars",
  );
  assert.equal(celebrating(0.7).eyes, "happy");
  assert.equal(celebrating(CELEBRATE_FOR - 0.01).front, "");
});

test("shrugging spreads the hands, looks both ways and floats question marks", () => {
  assert.deepEqual(shrugging(1.5).L, [80, 15, 140, 15]);
  assert.ok(shrugging(1.5).front.includes("?"));
  assert.ok(shrugging(1).look[0] < 0 && shrugging(3).look[0] > 0);
  assert.equal(shrugging(SHRUG_FOR).front, "");
});

test("a Blink swung round twice goes dizzy in the air: circles, eyes shut, hands up", () => {
  const w = [0, 0.275, 0.55, 0.825].map((k) => whirled(k));
  assert.ok(
    Math.max(...w.map((p) => p.x)) - Math.min(...w.map((p) => p.x)) > 50,
  );
  assert.equal(w[0].eyes, "squeeze");
  assert.deepEqual(w[0].L, [118, 10, 150, 10]);
  const blink = rig();
  play(blink, 1, () => ({ mode: "drag", whirlAt: 1 }), 1);
  assert.equal(blink.last.eyes, "squeeze", "in the air it is already dizzy");
  assert.equal(blink.last.mouth, "o");
});

test("letting go of a spun Blink drops it first, then it sways with spiral eyes", () => {
  const blink = rig();
  blink.pose(10.1, { dizzyAt: 10 });
  assert.ok(blink.last.y < -25, "still in the air a moment after");
  blink.pose(10.2, { dizzyAt: 10 });
  const fallen = blink.last.y;
  play(blink, 10.3, () => ({ dizzyAt: 10 }), 1);
  assert.ok(fallen < 0);
  assert.equal(blink.last.eyes, "dizzy");
});

test("the idle grumble stands: when Blink is out its arms hang and sway, no edge grips", () => {
  const blink = rig();
  play(
    blink,
    1,
    () => ({ mode: "hover", face: "idle", grumbling: true, edge: "right" }),
    1.5,
  );
  assert.equal(blink.peeking, 0);
  assert.ok(blink.last.L[0] < 40 && blink.last.R[0] < 40, "arms hang");
  assert.equal(blink.last.armsOver ?? false, false);
  assert.ok(blink.last.lid > 0.3, "half-closed eyes");
  assert.ok(blink.last.clipY == null, "nothing hides the legs");
});

test("every one-off motion is a pure function of time and returns finite numbers", () => {
  for (const f of [
    eating,
    appearing,
    leaving,
    celebrating,
    shrugging,
    fileCaught,
    whirled,
  ])
    for (let k = 0; k < 5; k += 0.05)
      for (const [name, v] of Object.entries(f(k)))
        if (typeof v === "number")
          assert.ok(Number.isFinite(v), `${f.name} ${name} ${k}`);
});

test("a turn is not hidden by a wave or a touch that starts while it plays", () => {
  const blink = rig();
  const o = {
    turnAt: 5,
    turnDir: 1,
    waveAt: 5.1,
    touch: { part: "belly", side: 1 },
  };
  play(blink, 5.2, () => o, 0.3);
  assert.equal(blink.key(), "turn");
});

test("guiding reaches the nearer arm toward the step and puts the stick along it", () => {
  const right = guiding(1, { x: 1, y: 0 }),
    left = guiding(1, { x: -1, y: 0 }),
    down = guiding(1, { x: 0, y: 1 });
  assert.ok(Math.abs(right.R[0] - 90) < 1e-6, "level to the right");
  assert.deepEqual(right.L, [55, 0, 8, 0], "the other arm rests");
  assert.ok(Math.abs(left.L[0] - 90) < 1e-6, "level to the left");
  assert.ok(Math.abs(down.R[0]) < 1e-6, "straight down");
  assert.ok(right.attach.includes("<circle"), "a stick with a ball at its end");
  assert.notEqual(
    guiding(1, { x: 1, y: 0 }).attach,
    guiding(1.2, { x: 1, y: 0 }).attach,
  );
  assert.deepEqual(right.look, [1, 0]);
});

test("the guide stick reaches far enough past the hand to be seen pointing", () => {
  const { attach } = guiding(0, { x: 0, y: -1 });
  const [x1, y1, x2, y2] = attach
    .match(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/)
    .slice(1)
    .map(Number);
  assert.ok(Math.hypot(x2 - x1, y2 - y1) >= 80, "at least 80 px long");
});

test("the swallow ends where the gulp ends, so the card can open on it", () => {
  const at = (k) => eating(k);
  assert.ok(EAT_SWALLOWED < EAT_FOR);
  // Chewing and gulping stop at the same moment: the body is at rest after it.
  assert.notEqual(at(EAT_SWALLOWED - 0.05).y, 0);
  assert.equal(at(EAT_SWALLOWED + 0.01).mouth, "smile");
});
