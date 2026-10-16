import test from "node:test";
import assert from "node:assert/strict";
import {
  HAIRLINE,
  IGNITE_BASE,
  LINE,
  lapOf,
  light,
  perimeterOf,
  radiusFor,
  rings,
  snap,
  snapRing,
  tailOf,
  increments,
  coreFor,
  trace,
} from "./frame.mjs";
import { duration, timing } from "../shared/motion.mjs";

const rect = { x: 100, y: 50, width: 300, height: 120 };

/** Records a trace and measures what it draws: straight runs and arcs. */
function measure(r, radius) {
  const calls = [];
  const path = {
    moveTo: (x, y) => calls.push({ type: "move", x, y }),
    lineTo: (x, y) => calls.push({ type: "line", x, y }),
    arc: (x, y, rad, from, to) =>
      calls.push({ type: "arc", x, y, radius: rad, from, to }),
    closePath: () => calls.push({ type: "close" }),
  };
  trace(path, r, radius);
  let at = null,
    length = 0;
  for (const c of calls) {
    if (c.type === "move") at = { x: c.x, y: c.y };
    else if (c.type === "line") {
      length += Math.hypot(c.x - at.x, c.y - at.y);
      at = { x: c.x, y: c.y };
    } else if (c.type === "arc") {
      const start = {
        x: c.x + Math.cos(c.from) * c.radius,
        y: c.y + Math.sin(c.from) * c.radius,
      };
      // The path must arrive where the arc begins.
      assert.ok(Math.hypot(start.x - at.x, start.y - at.y) < 1e-9, "joined");
      length += c.radius * (c.to - c.from);
      at = {
        x: c.x + Math.cos(c.to) * c.radius,
        y: c.y + Math.sin(c.to) * c.radius,
      };
    }
  }
  return { calls, length, end: at };
}

test("the trace is the exact rounded rectangle, clockwise from after the top left corner", () => {
  const { calls, length, end } = measure(rect, 4);
  assert.deepEqual(calls[0], { type: "move", x: 104, y: 50 });
  assert.deepEqual(calls[1], { type: "line", x: 396, y: 50 });
  // Along the top to the right first: clockwise on screen.
  assert.equal(calls[2].type, "arc");
  assert.deepEqual([calls[2].x, calls[2].y], [396, 54]);
  assert.ok(calls.filter((c) => c.type === "arc").every((c) => c.to > c.from));
  assert.ok(Math.abs(length - perimeterOf(rect, 4)) < 1e-9);
  assert.deepEqual(end, { x: 104, y: 50 }, "closes where it began");
});

test("the radius is never more than half the shorter side and a corner of 0 is square", () => {
  assert.equal(radiusFor(rect, 4), 4);
  assert.equal(radiusFor({ width: 6, height: 300 }, 4), 3);
  assert.equal(radiusFor(rect, -2), 0);
  const { length } = measure({ x: 0, y: 0, width: 10, height: 6 }, 0);
  assert.equal(length, 32);
});

test("three lines, outside in: a dark hairline, 2 px of green on the edge, a light hairline", () => {
  const [outer, line, inner] = rings(rect, 4);
  assert.deepEqual(
    [outer.role, line.role, inner.role],
    ["outer", "line", "inner"],
  );
  assert.deepEqual(
    [outer.width, line.width, inner.width],
    [HAIRLINE, LINE, HAIRLINE],
  );
  assert.equal(LINE, 2);
  assert.deepEqual(line.rect, rect, "the green sits on the edge itself");
  // Each line touches the next without a gap or an overlap: the green covers 1 px
  // either side of the edge, the hairlines the pixel beyond it.
  assert.equal(rect.x - outer.rect.x, (LINE + HAIRLINE) / 2);
  assert.equal(inner.rect.x - rect.x, (LINE + HAIRLINE) / 2);
  assert.equal(outer.rect.width, rect.width + 3);
  assert.equal(inner.rect.width, rect.width - 3);
  // The corners stay concentric.
  assert.equal(outer.radius, 5.5);
  assert.equal(line.radius, 4);
  assert.equal(inner.radius, 2.5);
});

test("a frame smaller than its lines keeps them inside itself", () => {
  const [, , inner] = rings({ x: 0, y: 0, width: 2, height: 2 }, 4);
  assert.ok(inner.rect.width >= 0 && inner.rect.height >= 0);
  assert.ok(inner.radius >= 0);
});

test("lines are moved onto whole device pixels at every scale", () => {
  for (const dpr of [1, 1.25, 1.5, 2, 3]) {
    for (const width of [1, 2]) {
      // A line of a fraction of a device pixel cannot be whole pixels anyway.
      if (!Number.isInteger(width * dpr)) continue;
      for (const value of [10, 10.2, 10.5, 10.9, 333.33]) {
        const at = snap(value, width, dpr);
        const covered = at * dpr - (width * dpr) / 2;
        assert.ok(
          Math.abs(covered - Math.round(covered)) < 1e-9,
          `${value} at ${dpr}x, ${width} px: starts on device pixel ${covered}`,
        );
        assert.ok(
          Math.abs(at - value) <= 1 / dpr + 1e-9,
          "moves by under a pixel",
        );
      }
    }
  }
});

test("on the device pixel grid the three lines sit side by side with no gap and no overlap", () => {
  // Whole device pixels only: at 1.25x a 1 px line is a pixel and a quarter.
  for (const dpr of [1, 2, 3]) {
    for (const x of [100, 100.4, 100.5, 100.6, 237.25]) {
      const box = { x, y: x / 2, width: 300, height: 120 };
      const [outer, line, inner] = rings(box, 4).map((ring) => {
        const at = snapRing(ring, dpr);
        const half = (ring.width * dpr) / 2;
        // The device pixels the stroke covers along the top edge and the left edge.
        return {
          top: [at.y * dpr - half, at.y * dpr + half],
          left: [at.x * dpr - half, at.x * dpr + half],
          bottom: [
            (at.y + at.height) * dpr - half,
            (at.y + at.height) * dpr + half,
          ],
        };
      });
      for (const side of ["top", "left"]) {
        const label = `${dpr}x at ${x}: ${side}`;
        assert.ok(
          Math.abs(outer[side][1] - line[side][0]) < 1e-6,
          `${label}: outer meets green`,
        );
        assert.ok(
          Math.abs(line[side][1] - inner[side][0]) < 1e-6,
          `${label}: green meets inner`,
        );
      }
      assert.ok(
        Math.abs(inner.bottom[1] - line.bottom[0]) < 1e-6,
        `${dpr}x at ${x}: inner meets green at the bottom`,
      );
      assert.ok(
        Math.abs(line.bottom[1] - outer.bottom[0]) < 1e-6,
        `${dpr}x at ${x}: green meets outer at the bottom`,
      );
    }
  }
});

test("a lap is the perimeter at 500 px a second, never under 1.8 s or over 3.6 s", () => {
  assert.equal(lapOf(100), 1800);
  assert.equal(lapOf(900), 1800);
  assert.equal(lapOf(1500), 3000);
  assert.equal(lapOf(1800), 3600);
  assert.equal(lapOf(50000), 3600);
  // The tail never wraps onto its own head, on a small frame or a large one.
  assert.equal(tailOf(100), 50);
  assert.equal(tailOf(5000), 240);
});

test("the tail is 22% of the perimeter, kept between 60 and 240 px", () => {
  assert.equal(tailOf(600), 132);
  assert.equal(tailOf(1000), 220);
  assert.equal(tailOf(2000), 240);
  assert.equal(tailOf(200), 60);
  // On a tiny frame it is never more than half the way round.
  assert.equal(tailOf(100), 50);
});

test("while it ignites, the frame behind the head is at full strength and the rest at 35%", () => {
  const p = perimeterOf(rect, 4);
  assert.equal(light(0, p).lit, 0);
  assert.equal(light(300, p).lit, 0.5);
  assert.equal(light(300, p).base, IGNITE_BASE);
  assert.ok(light(timing.edgeIgnite - 1, p).lit > 0.99);
  // Afterwards the settling base carries it and nothing is lit specially.
  assert.equal(light(timing.edgeIgnite + 10, p).lit, 0);
  assert.equal(light(100, p, { reduced: true }).lit, 0);
});

test("the streak's strokes stack to the wanted ramp with no seam, added or composited", () => {
  const ramp = (share) => 0.9 * share * share;
  for (const mode of ["add", "over"]) {
    const steps = increments(16, ramp, mode);
    assert.equal(steps.length, 16);
    let reached = 0;
    steps.forEach((step, k) => {
      assert.ok(step >= 0, `${mode} ${k}`);
      reached =
        mode === "add" ? reached + step : 1 - (1 - reached) * (1 - step);
      assert.ok(Math.abs(reached - ramp((k + 1) / 16)) < 1e-9, `${mode} ${k}`);
    });
  }
});

test("the core is white on a dark page and a deeper green on a light one", () => {
  assert.equal(coreFor("#43d896", true), "#ffffff");
  assert.equal(coreFor("#1f9e68", false), "rgb(16, 79, 52)");
});

test("it ignites at 35% with one streak clockwise in 600 ms", () => {
  const p = perimeterOf(rect, 4);
  assert.equal(timing.edgeIgnite, 600);
  const start = light(0, p);
  assert.equal(start.phase, "ignite");
  assert.equal(start.base, IGNITE_BASE);
  assert.equal(IGNITE_BASE, 0.35);
  assert.equal(start.head, 0);
  assert.equal(start.strength, 1);
  const half = light(300, p);
  assert.equal(half.head, 0.5);
  assert.equal(half.base, 0.35);
  // The streak only ever moves forward, one lap, and arrives where it began.
  let before = -1;
  for (let ms = 0; ms < timing.edgeIgnite; ms += 20) {
    const { head } = light(ms, p);
    assert.ok(head >= before, `at ${ms} ms`);
    before = head;
  }
  assert.equal(light(timing.edgeIgnite - 1, p).phase, "ignite");
  assert.ok(light(timing.edgeIgnite - 1, p).head > 0.99);
});

test("afterwards one calm streak runs clockwise at a constant speed and the frame settles to full", () => {
  const p = perimeterOf(rect, 4);
  const lap = lapOf(p);
  const t0 = timing.edgeIgnite + duration.slow;
  assert.equal(light(timing.edgeIgnite, p).phase, "calm");
  assert.equal(light(timing.edgeIgnite, p).head, 0);
  assert.equal(light(t0, p).base, 1);
  assert.ok(light(timing.edgeIgnite + 50, p).base < 1);
  // Constant speed: equal steps in time are equal steps round the frame.
  const heads = [0, 1, 2, 3, 4].map((i) => light(t0 + (i * lap) / 10, p).head);
  const steps = heads.slice(1).map((h, i) => h - heads[i]);
  for (const step of steps) assert.ok(Math.abs(step - 0.1) < 1e-9, `${step}`);
  // A whole lap brings it back, and it goes on for as long as the frame is up.
  assert.ok(Math.abs(light(t0 + lap, p).head - light(t0, p).head) < 1e-9);
  assert.ok(light(t0 + 60000, p).head < 1);
  // It is calmer than the ignition.
  assert.ok(light(t0, p).strength < 1);
  assert.ok(light(t0, p).strength > 0.5);
});

test("a long frame laps in 3.6 s and a small one in 1.8 s", () => {
  const big = perimeterOf({ width: 1280, height: 800 }, 4);
  const small = perimeterOf({ width: 120, height: 80 }, 4);
  const after = timing.edgeIgnite + duration.slow;
  const at = (p, ms) => light(after + ms, p).head;
  assert.ok(Math.abs(at(big, 3600) - at(big, 0)) < 1e-9);
  assert.ok(at(big, 1800) > 0.4 && at(big, 1800) < 0.6);
  assert.ok(Math.abs(at(small, 1800) - at(small, 0)) < 1e-9);
});

test("with reduced motion the frame is still: shown once, a glow, no streak", () => {
  const p = perimeterOf(rect, 4);
  assert.equal(light(0, p, { reduced: true }).head, null);
  assert.equal(light(60000, p, { reduced: true }).head, null);
  assert.equal(light(60000, p, { reduced: true }).strength, 0);
  const done = light(duration.fast, p, { reduced: true });
  assert.equal(done.base, 1);
  assert.equal(done.glow, 1);
  assert.equal(light(60000, p, { reduced: true }).base, 1);
  assert.ok(light(0, p, { reduced: true }).base < 1, "fades in once");
});
