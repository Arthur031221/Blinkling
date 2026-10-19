import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SETTLE_FRAMES,
  SurfaceGuard,
  fadeScript,
  fadeDuration,
  cropGeometry,
  deadline,
  deliverCapture,
  freezeDisplay,
} from "./core.mjs";
import { duration, timing } from "../shared/motion.mjs";

test("crop uses captured pixel size, including fractional scale and negative origins", () => {
  for (const scale of [1, 1.5, 2]) {
    const capture = {
      region: { x: 0, y: 0, width: 800, height: 600 },
      pixelWidth: 800 * scale,
      pixelHeight: 600 * scale,
    };
    assert.deepEqual(
      cropGeometry({ x: 100, y: 90, width: 200, height: 120 }, capture),
      {
        x: 100 * scale,
        y: 90 * scale,
        width: 200 * scale,
        height: 120 * scale,
      },
    );
  }
  assert.throws(() =>
    cropGeometry(
      { x: -1, y: 0, width: 10, height: 10 },
      {
        region: { width: 800, height: 600 },
        pixelWidth: 800,
        pixelHeight: 600,
      },
    ),
  );
  assert.throws(() =>
    cropGeometry(
      { x: 0, y: 0, width: 0, height: 10 },
      {
        region: { width: 800, height: 600 },
        pixelWidth: 800,
        pixelHeight: 600,
      },
    ),
  );
  const d = {
    id: 2,
    bounds: { x: -800, y: -200, width: 800, height: 600 },
    workArea: { x: -800, y: -200, width: 800, height: 580 },
    scaleFactor: 1.5,
  };
  const frozen = freezeDisplay(d);
  d.bounds.x = 42;
  assert.equal(frozen.bounds.x, -800);
  assert.ok(Object.isFrozen(frozen.bounds));
});

const quickly = { settle: async () => {} };

test("surface guard serializes captures and fades surfaces back in after failures, never hiding them", async () => {
  const log = [];
  const window = (name, visible = true) => ({
    isDestroyed: () => false,
    isVisible: () => visible,
    hide: () => log.push(`hide ${name}`),
    showInactive: () => log.push(`show ${name}`),
    name,
  });
  const all = [window("Blink"), window("chat"), window("hidden", false)];
  const guard = new SurfaceGuard(() => all, {
    ...quickly,
    fade: async (w, to) => log.push(`fade ${to} ${w.name}`),
  });
  const a = guard.run(async () => {
    log.push("capture 1");
    throw Error("portal cancelled");
  });
  const b = guard.run(async () => {
    log.push("capture 2");
    return "ok";
  });
  assert.equal(await b, "ok");
  await assert.rejects(a, /portal cancelled/);
  assert.deepEqual(log, [
    "fade 0 Blink",
    "fade 0 chat",
    "capture 1",
    "fade 1 Blink",
    "fade 1 chat",
    "fade 0 Blink",
    "fade 0 chat",
    "capture 2",
    "fade 1 Blink",
    "fade 1 chat",
  ]);
});

test("a surface shown while the first ones fade is faded before the capture and restored after", async () => {
  const log = [];
  let shown = false;
  const surface = (name, visible) => ({
    isDestroyed: () => false,
    isVisible: visible,
    name,
  });
  const all = [surface("Blink", () => true), surface("card", () => shown)];
  const guard = new SurfaceGuard(() => all, {
    ...quickly,
    fade: async (w, to) => {
      log.push(`fade ${to} ${w.name}`);
      if (w.name === "Blink" && to === 0) shown = true;
    },
  });
  await guard.run(async () => log.push("capture"));
  assert.deepEqual(log, [
    "fade 0 Blink",
    "fade 0 card",
    "capture",
    "fade 1 Blink",
    "fade 1 card",
  ]);
});

test("abort while queued never fades surfaces and destroyed surfaces are not restored", async () => {
  const controller = new AbortController();
  const log = [];
  let destroyed = false;
  const surface = { isDestroyed: () => destroyed, isVisible: () => true };
  const guard = new SurfaceGuard(() => [surface], {
    ...quickly,
    fade: async (w, to) => log.push(`fade ${to}`),
  });
  const first = guard.run(async () => {
    controller.abort();
    destroyed = true;
  });
  const second = guard.run(
    async () => assert.fail("aborted capture ran"),
    controller.signal,
  );
  await first;
  await assert.rejects(second, { name: "AbortError" });
  assert.deepEqual(log, ["fade 0"]);
});

test("a surface that fails to fade out does not fail the capture, and fades in anyway", async () => {
  const log = [];
  const surface = { isDestroyed: () => false, isVisible: () => true };
  const guard = new SurfaceGuard(() => [surface], {
    ...quickly,
    fade: async (w, to) => {
      log.push(`fade ${to}`);
      if (to === 0) throw Error("page is gone");
    },
  });
  assert.equal(await guard.run(async () => "taken"), "taken");
  assert.deepEqual(log, ["fade 0", "fade 1"]);
});

test("fading is a renderer opacity animation: tokens, one named animation, reversible, reduced motion instant", () => {
  const script = fadeScript(0, {
    duration: 120,
    easing: "ease",
    reduced: false,
  });
  assert.match(script, /opacity/);
  assert.match(script, /playbackRate/);
  assert.doesNotMatch(script, /\b(width|height|top|left|display)\s*:/);
  const reduced = fadeScript(1, {
    duration: 120,
    easing: "ease",
    reduced: true,
  });
  assert.match(reduced, /\b0\b/);
  assert.equal(fadeDuration(false), duration.fast);
  assert.equal(fadeDuration(true), 0);
});

test("delivering a capture resolves with what the handler returned", async () => {
  const seen = [];
  await deliverCapture(async (capture) => seen.push(capture), { id: "a" }, 50);
  assert.deepEqual(seen, [{ id: "a" }]);
});

test("a handler that throws surfaces its own error", async () => {
  await assert.rejects(
    deliverCapture(
      async () => {
        throw Error("card window is gone");
      },
      { id: "a" },
      50,
    ),
    /card window is gone/,
  );
});

test("a handler that never settles times out instead of hanging the caller", async () => {
  const started = Date.now();
  await assert.rejects(
    deliverCapture(() => new Promise(() => {}), { id: "a" }, 40),
    { code: "CAPTURE_DELIVERY_TIMEOUT" },
  );
  assert.ok(Date.now() - started < 1000);
});

test("a handler that throws synchronously is reported the same way", async () => {
  await assert.rejects(
    deliverCapture(
      () => {
        throw Error("sync failure");
      },
      { id: "a" },
      50,
    ),
    /sync failure/,
  );
});

test("deadline passes a result through, and rejects with a code when the work hangs or throws", async () => {
  assert.equal(await deadline(Promise.resolve(7), 50, "X"), 7);
  await assert.rejects(deadline(new Promise(() => {}), 20, "CAPTURE_TIMEOUT"), {
    code: "CAPTURE_TIMEOUT",
  });
  await assert.rejects(
    deadline(Promise.reject(new Error("boom")), 50, "X"),
    /boom/,
  );
});
test("deadline does not keep the process alive after the work finishes", async () => {
  const started = Date.now();
  await deadline(Promise.resolve(), 60_000, "X");
  assert.ok(Date.now() - started < 1000);
});

test("a faded surface is given long enough to be presented before the screen is read", async () => {
  const guard = new SurfaceGuard(
    () => [{ isDestroyed: () => false, isVisible: () => true }],
    { fade: async () => {} },
  );
  const marks = [];
  await guard.run(async () => marks.push(Date.now()));
  const began = Date.now();
  await guard.run(async () => marks.push(Date.now() - began));
  assert.ok(SETTLE_FRAMES >= (process.platform === "linux" ? 4 : 8));
  assert.ok(marks[1] >= SETTLE_FRAMES * timing.frame * 0.9, `${marks[1]} ms`);
});

test("surface guard leaves Blink as faint as it is told to and takes everything else out", async () => {
  const seen = [];
  const win = (name) => ({
    isDestroyed: () => false,
    isVisible: () => true,
    name,
  });
  const all = [win("Blink"), win("card")];
  const guard = new SurfaceGuard(() => all, {
    ...quickly,
    level: (w) => (w.name === "Blink" ? 0.3 : 0),
    fade: async (w, to, level) => seen.push([w.name, to, level]),
  });
  await guard.run(async () => {});
  assert.deepEqual(seen.slice(0, 2), [
    ["Blink", 0, 0.3],
    ["card", 0, 0],
  ]);
  assert.match(
    fadeScript(0, {
      duration: 0,
      easing: "linear",
      reduced: false,
      level: 0.3,
    }),
    /opacity: 0\.3/,
  );
  assert.match(
    fadeScript(0, { duration: 0, easing: "linear", reduced: false }),
    /opacity: 0 \}/,
  );
});
