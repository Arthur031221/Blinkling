import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { planEffect, MAX_EFFECT_MS, PAD } from "./effects.mjs";
import { TAKEN_KINDS, effectFor } from "./kinds.mjs";
import { duration } from "../shared/motion.mjs";

const bounds = { x: 100, y: 80, width: 320, height: 140 };
const lines = Array.from({ length: 5 }, (_, i) => ({
  x: 100,
  y: 84 + i * 26,
  width: 320 - i * 20,
  height: 18,
}));
const end = (p) => p.delay + p.duration;

test("every kind plans an effect that finishes within 450 ms", () => {
  assert.equal(MAX_EFFECT_MS, 450);
  for (const kind of TAKEN_KINDS) {
    const plan = planEffect({ kind, bounds, lines, seed: 3 });
    assert.equal(plan.effect, effectFor(kind));
    assert.ok(plan.primitives.length > 0, kind);
    for (const p of plan.primitives)
      assert.ok(end(p) <= MAX_EFFECT_MS, `${kind}: ends at ${end(p)}`);
    assert.ok(plan.total <= MAX_EFFECT_MS, `${kind} total ${plan.total}`);
  }
});

test("many lines still finish in time by tightening the stagger", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ x: 0, y: i * 10, width: 200, height: 8 }));
  const plan = planEffect({ kind: "text", bounds: { x: 0, y: 0, width: 200, height: 600 }, lines: many, seed: 1 });
  assert.ok(plan.total <= MAX_EFFECT_MS);
  assert.equal(plan.primitives.length, 60);
});

test("text: one crayon stroke per line, drawn top to bottom, each left to right", () => {
  const plan = planEffect({ kind: "text", bounds, lines, seed: 1 });
  assert.equal(plan.primitives.length, lines.length);
  for (let i = 1; i < plan.primitives.length; i++)
    assert.ok(plan.primitives[i].delay > plan.primitives[i - 1].delay);
  assert.ok(plan.primitives.every((p) => p.reveal === "left"));
  // "a few tens of milliseconds apart"
  const gap = plan.primitives[1].delay - plan.primitives[0].delay;
  assert.ok(gap >= 10 && gap <= 60, `gap ${gap}`);
});

test("text without measured lines falls back to one stroke over the bounds", () => {
  const plan = planEffect({ kind: "text", bounds, lines: [], seed: 1 });
  assert.equal(plan.primitives.length, 1);
});

test("the drawing is deterministic for a seed and different across seeds", () => {
  const a = planEffect({ kind: "image", bounds, lines, seed: 5 });
  const b = planEffect({ kind: "image", bounds, lines, seed: 5 });
  const c = planEffect({ kind: "image", bounds, lines, seed: 6 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.primitives.map((p) => p.d), c.primitives.map((p) => p.d));
});

test("every primitive's box stays within the picked bounds plus the padding", () => {
  for (const kind of TAKEN_KINDS) {
    const plan = planEffect({ kind, bounds, lines, seed: 2 });
    for (const p of plan.primitives) {
      assert.ok(p.box.x >= bounds.x - PAD && p.box.y >= bounds.y - PAD, `${kind} origin`);
      assert.ok(p.box.x + p.box.width <= bounds.x + bounds.width + PAD, `${kind} right`);
      assert.ok(p.box.y + p.box.height <= bounds.y + bounds.height + PAD, `${kind} bottom`);
    }
  }
});

test("a loop around an image closes: four sides drawn one after another", () => {
  const plan = planEffect({ kind: "image", bounds, lines, seed: 1 });
  const strokes = plan.primitives.filter((p) => p.role === "stroke");
  assert.equal(strokes.length, 4);
  assert.deepEqual(strokes.map((p) => p.reveal), ["left", "top", "right", "bottom"]);
});

test("table: outline plus a light sweep down the rows", () => {
  const plan = planEffect({ kind: "table", bounds, lines, seed: 1 });
  const sweep = plan.primitives.find((p) => p.role === "sweep");
  assert.ok(sweep);
  assert.equal(sweep.reveal, "top");
  assert.ok(plan.primitives.filter((p) => p.role === "stroke").length >= 4);
});

test("code: brackets on both sides", () => {
  const plan = planEffect({ kind: "code", bounds, lines, seed: 1 });
  const xs = plan.primitives.map((p) => p.box.x);
  assert.equal(plan.primitives.length, 2);
  assert.ok(Math.min(...xs) < bounds.x + 1 && Math.max(...xs) > bounds.x + bounds.width / 2);
});

test("video gets corner brackets and the 'this frame' tag", () => {
  const plan = planEffect({ kind: "video", bounds, lines, seed: 1 });
  assert.equal(plan.primitives.filter((p) => p.role === "corner").length, 4);
  assert.equal(plan.primitives.filter((p) => p.role === "tag").length, 1);
  const chart = planEffect({ kind: "chart", bounds, lines, seed: 1 });
  assert.equal(chart.primitives.filter((p) => p.role === "tag").length, 0);
});

test("a window pick outlines the whole window edge", () => {
  const plan = planEffect({ kind: "window", bounds, lines: [], seed: 1 });
  assert.equal(plan.primitives.filter((p) => p.role === "stroke").length, 4);
});

test("reduced motion turns the effect into one short fade of an outline", () => {
  const plan = planEffect({ kind: "text", bounds, lines, seed: 1, reducedMotion: true });
  assert.equal(plan.primitives.length, 1);
  assert.equal(plan.primitives[0].reveal, "fade");
  assert.equal(plan.total, duration.fast);
});

test("the planner never animates anything but transform and opacity", () => {
  const plan = planEffect({ kind: "table", bounds, lines, seed: 1 });
  for (const p of plan.primitives)
    assert.ok(["left", "right", "top", "bottom", "fade"].includes(p.reveal));
});
