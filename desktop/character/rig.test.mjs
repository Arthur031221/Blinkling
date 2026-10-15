import test from "node:test";
import assert from "node:assert/strict";
import {
  ARM,
  BODY,
  STAND,
  armGeom,
  dir,
  drawBlink,
  legGeom,
  silhouette,
} from "./rig.mjs";
import {
  DIZZY_FOR,
  PEEK_EDGE,
  blendPose,
  dizzy,
  facePose,
  grumbling,
  held,
  idle,
  peek,
  touched,
} from "./motions.mjs";

const body = (svg) => svg.match(/class="blink-body" d="([^"]+)"/)?.[1];

test("a limb direction is a unit vector, so poses only rotate joints", () => {
  for (const side of [-1, 1])
    for (const abd of [-60, 0, 55, 125, 172])
      for (const fwd of [-30, 0, 40, 70]) {
        const v = dir(side, abd, fwd);
        assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9, `${abd} ${fwd}`);
      }
});

test("an arm keeps its lengths: shoulder to elbow and elbow to hand never change", () => {
  const poses = [
    [55, 0, 8, 0],
    [150, 10, 172, 10],
    [-5, 70, -60, 30],
    [168, 40, 20, 50],
  ];
  for (const side of [-1, 1])
    for (const pose of poses) {
      const g = armGeom(side, pose, 0);
      const e = dir(side, pose[0], pose[1]).map((v) => v * ARM.up);
      const f = dir(side, pose[2], pose[3]).map((v) => v * ARM.fore);
      assert.ok(Math.abs(Math.hypot(...e) - ARM.up) < 1e-9);
      assert.ok(Math.abs(Math.hypot(...f) - ARM.fore) < 1e-9);
      assert.equal(g.pts.length, ARM.n + 1);
    }
});

test("a leg keeps its length however it swings", () => {
  const a = legGeom(1, [0, 0, 0], 0);
  const b = legGeom(1, [30, 25, 0], 0);
  assert.ok(Math.abs(Math.hypot(a.a.x - a.h.x, a.a.y - a.h.y)) > 0);
  assert.ok(
    Math.abs(
      Math.hypot(b.a.x - b.h.x, b.a.y - b.h.y, b.a.z - b.h.z) -
        Math.hypot(a.a.x - a.h.x, a.a.y - a.h.y, a.a.z - a.h.z),
    ) < 1.5,
  );
});

test("the body is rigid: arms and legs never change its outline", () => {
  const rest = body(drawBlink({}, "t"));
  const waving = body(
    drawBlink({ R: [125, 10, 160, 10], legL: [20, 10], legR: [-20, 10] }, "t"),
  );
  assert.ok(rest);
  assert.equal(waving, rest);
});

test("turning about the vertical axis changes the outline only through yaw", () => {
  const a = silhouette(0),
    b = silhouette(24);
  assert.equal(a.x1, BODY.cx - BODY.w / 2);
  assert.ok(b.x2 - b.x1 !== a.x2 - a.x1);
});

test("every motion draws finite numbers and keeps the body", () => {
  const poses = {
    idle: idle(1.3),
    grumble: { ...idle(1), ...grumbling(2.1) },
    held: held(5, 0.7, 300),
    dizzy: dizzy(1.2),
    peek: peek(2),
    head: touched(1, "head", 1, 0.5),
    belly: touched(1, "belly", -1, 0.5),
    hand: touched(1, "hand", 1, 0.5),
    foot: touched(1, "foot", -1, 0.5),
    cheek: touched(1, "cheek", 1, 0.5),
    thinking: facePose("thinking", 1),
    error: facePose("error", 1),
    permission: facePose("permission", 1),
  };
  for (const [name, pose] of Object.entries(poses)) {
    const svg = drawBlink(pose, "t");
    assert.ok(body(svg), `${name}: the body is drawn`);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/, name);
  }
});

test("a blend starts at the first pose and ends at the second", () => {
  const a = { ...STAND, y: 0, R: [55, 0, 8, 0] };
  const b = { ...STAND, y: -10, R: [125, 10, 160, 10] };
  const start = blendPose(a, b, 0),
    end = blendPose(a, b, 1),
    mid = blendPose(a, b, 0.5);
  assert.equal(start.y, 0);
  assert.equal(end.y, -10);
  assert.deepEqual(end.R, [125, 10, 160, 10]);
  assert.equal(mid.y, -5);
  assert.equal(mid.R[0], 90);
});

test("peeking grips the edge with both hands and keeps both eyes in view", () => {
  const p = peek(0);
  assert.equal(p.clipY, PEEK_EDGE);
  assert.equal(p.armsOver, true);
  assert.deepEqual(p.L, p.R);
  assert.ok(p.R[0] > 150, "the arms reach up over the edge");
  assert.ok(Math.abs(p.roll) > 3, "the head is tilted");
});

test("dizzy shows spiral eyes and stars, then recovers", () => {
  const during = dizzy(1);
  assert.equal(during.eyes, "dizzy");
  assert.equal((during.back + during.front).match(/<path/g)?.length ?? 0, 3);
  const after = dizzy(DIZZY_FOR);
  assert.equal(after.eyes, "open");
  assert.equal(after.back + after.front, "");
});

test("held is scared and never a rectangle", () => {
  const p = held(2, 0.5, 400);
  assert.equal(p.eyes, "wide");
  assert.ok(!("sx" in p) && !("sy" in p));
});

test("an idle grumble lets the arms hang and sway, never hands on hips", () => {
  for (let t = 0; t < 6; t += 0.5) {
    const g = grumbling(t);
    for (const arm of [g.L, g.R].filter(Boolean)) {
      assert.ok(arm[0] < 90, `t=${t}: the upper arm hangs`);
      assert.ok(arm[2] < 90, `t=${t}: the forearm hangs`);
    }
  }
});
