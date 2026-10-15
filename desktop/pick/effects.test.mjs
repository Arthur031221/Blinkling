import test from "node:test";
import assert from "node:assert/strict";
import { effectPlan, EFFECT_FOR, EFFECT_MAX, lockPlan } from "./effects.mjs";
import { duration } from "../shared/motion.mjs";

const bounds = { x: 100, y: 100, width: 300, height: 120 };
const KINDS = [
  "text",
  "image",
  "table",
  "code",
  "formula",
  "chart",
  "video",
  "control",
  "section",
  "window",
  "area",
  "screen",
  "page",
];
const end = (plan) =>
  Math.max(0, ...plan.strokes.map((s) => s.at + s.duration));

test("every taken kind has an effect and no effect is missing from the table", () => {
  for (const kind of KINDS) assert.ok(EFFECT_FOR[kind], kind);
  assert.deepEqual(Object.keys(EFFECT_FOR).sort(), [...KINDS].sort());
});

test("every effect finishes within about 450 ms, and the cap is made of tokens", () => {
  assert.ok(EFFECT_MAX <= 450);
  assert.equal(EFFECT_MAX, duration.slow + duration.fast);
  for (const kind of KINDS) {
    const plan = effectPlan({ kind, bounds, lines: [] });
    assert.ok(end(plan) <= 450, `${kind} ends at ${end(plan)}`);
    assert.ok(plan.total <= 450, `${kind} total ${plan.total}`);
    assert.ok(plan.strokes.length > 0, kind);
  }
});

test("text gets one highlighter stroke per line, left to right, low on the line and quick", () => {
  const lines = [0, 1, 2].map((i) => ({
    x: 100,
    y: 100 + i * 20,
    width: 300 - i * 80,
    height: 20,
  }));
  const plan = effectPlan({ kind: "text", bounds, lines });
  assert.equal(plan.effect, "highlighter");
  const crayons = plan.strokes.filter((s) => s.role === "highlight");
  assert.equal(crayons.length, 3);
  for (let i = 0; i < 3; i++) {
    const s = crayons[i];
    const xs = s.points.map((p) => p.x);
    assert.ok(xs[0] < xs[xs.length - 1], "left to right");
    assert.ok(Math.min(...xs) >= lines[i].x - 6);
    assert.ok(Math.max(...xs) <= lines[i].x + lines[i].width + 6);
    // Under the middle of the line, where the baseline is, and never above it.
    for (const p of s.points) {
      assert.ok(p.y > lines[i].y + 10, `below the middle: ${p.y}`);
      assert.ok(p.y <= lines[i].y + lines[i].height, "inside the line box");
    }
    assert.ok(s.duration <= 120, "a quick stroke");
    assert.ok(s.thickness < lines[i].height / 2, "thinner than half the line");
  }
  const gaps = [crayons[1].at - crayons[0].at, crayons[2].at - crayons[1].at];
  for (const gap of gaps) assert.ok(gap >= 20 && gap <= 60, `gap ${gap}`);
});

test("many lines are compressed to fit the cap, never skipped", () => {
  const lines = Array.from({ length: 40 }, (_, i) => ({
    x: 0,
    y: i * 20,
    width: 400,
    height: 20,
  }));
  const plan = effectPlan({
    kind: "text",
    bounds: { x: 0, y: 0, width: 400, height: 800 },
    lines,
  });
  assert.equal(plan.strokes.filter((s) => s.role === "highlight").length, 40);
  assert.ok(plan.total <= 450);
});

test("text without line geometry gets lines from the bounds height", () => {
  const plan = effectPlan({ kind: "text", bounds, lines: [] });
  assert.ok(plan.strokes.filter((s) => s.role === "highlight").length >= 5);
});

test("a hand-drawn edge is deterministic for the same bounds", () => {
  const a = effectPlan({ kind: "image", bounds });
  const b = effectPlan({ kind: "image", bounds });
  assert.deepEqual(a, b);
  const c = effectPlan({ kind: "image", bounds: { ...bounds, x: 101 } });
  assert.notDeepEqual(a.strokes[0].points, c.strokes[0].points);
});

test("an image loop closes on itself", () => {
  const plan = effectPlan({ kind: "image", bounds });
  assert.equal(plan.effect, "loop");
  const pts = plan.strokes[0].points;
  const gap = Math.hypot(
    pts[0].x - pts[pts.length - 1].x,
    pts[0].y - pts[pts.length - 1].y,
  );
  assert.ok(gap < 14, `loop gap ${gap}`);
});

test("a table gets an outline and a sweep down its rows", () => {
  const plan = effectPlan({ kind: "table", bounds });
  assert.deepEqual([...new Set(plan.strokes.map((s) => s.role))].sort(), [
    "outline",
    "sweep",
  ]);
  const sweep = plan.strokes.find((s) => s.role === "sweep");
  assert.equal(sweep.direction, "down");
});

test("code gets brackets on both sides", () => {
  const plan = effectPlan({ kind: "code", bounds });
  const brackets = plan.strokes.filter((s) => s.role === "bracket");
  assert.equal(brackets.length, 2);
  const [left, right] = brackets;
  assert.ok(Math.max(...left.points.map((p) => p.x)) <= bounds.x + 2);
  assert.ok(
    Math.min(...right.points.map((p) => p.x)) >= bounds.x + bounds.width - 2,
  );
});

test("a formula gets a wavy underline and an outline", () => {
  const plan = effectPlan({ kind: "formula", bounds });
  const roles = plan.strokes.map((s) => s.role).sort();
  assert.deepEqual(roles, ["outline", "wave"]);
  const wave = plan.strokes.find((s) => s.role === "wave");
  const ys = wave.points.map((p) => p.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 1, "wavy");
  assert.ok(Math.min(...ys) >= bounds.y + bounds.height - 2);
});

test("a chart gets four corner brackets", () => {
  const plan = effectPlan({ kind: "chart", bounds });
  assert.equal(plan.strokes.filter((s) => s.role === "corner").length, 4);
});

test("a control or link gets a small circle", () => {
  const small = { x: 500, y: 300, width: 80, height: 28 };
  const plan = effectPlan({ kind: "control", bounds: small });
  assert.equal(plan.effect, "circle");
  const pts = plan.strokes[0].points;
  assert.ok(Math.min(...pts.map((p) => p.x)) < small.x);
  assert.ok(Math.max(...pts.map((p) => p.x)) > small.x + small.width);
});

test("a video or canvas gets corner brackets and the this-frame tag", () => {
  const plan = effectPlan({ kind: "video", bounds });
  assert.equal(plan.strokes.filter((s) => s.role === "corner").length, 4);
  assert.equal(plan.tag, "frame");
  assert.equal(effectPlan({ kind: "image", bounds }).tag, null);
});

test("a section gets a crayon bracket down its left side", () => {
  const plan = effectPlan({ kind: "section", bounds });
  const b = plan.strokes.find((s) => s.role === "bracket");
  assert.ok(Math.max(...b.points.map((p) => p.x)) <= bounds.x + 2);
  assert.ok(
    Math.max(...b.points.map((p) => p.y)) -
      Math.min(...b.points.map((p) => p.y)) >=
      bounds.height * 0.8,
  );
});

test("a window, screen or page gets an outline along its edge", () => {
  for (const kind of ["window", "screen", "page", "area"]) {
    const plan = effectPlan({ kind, bounds });
    assert.ok(
      plan.strokes.some((s) => s.role === "outline"),
      kind,
    );
  }
});

test("the lock shows a small lock and takes nothing", () => {
  const plan = lockPlan({ x: 300, y: 300 });
  assert.equal(plan.effect, "lock");
  assert.equal(plan.taken, false);
  assert.ok(plan.total <= 450);
});

test("reduced motion turns every effect into one short fade of the final shape", () => {
  for (const kind of KINDS) {
    const plan = effectPlan({ kind, bounds, lines: [], reduced: true });
    assert.equal(plan.reduced, true, kind);
    assert.ok(plan.total <= duration.fast * 2, `${kind} ${plan.total}`);
    for (const s of plan.strokes) assert.equal(s.at, 0, kind);
  }
});

test("strokes stay aligned at every scale: plans are in DIP and scale linearly", () => {
  const a = effectPlan({ kind: "table", bounds });
  const k = 2;
  const scaled = effectPlan({
    kind: "table",
    bounds: {
      x: bounds.x * k,
      y: bounds.y * k,
      width: bounds.width * k,
      height: bounds.height * k,
    },
  });
  const box = (p) => {
    const xs = p.strokes.flatMap((s) => s.points.map((q) => q.x));
    const ys = p.strokes.flatMap((s) => s.points.map((q) => q.y));
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  };
  const [x0, x1] = box(a);
  const [X0, X1] = box(scaled);
  assert.ok(Math.abs(X0 / k - x0) < 8 && Math.abs(X1 / k - x1) < 8);
});
