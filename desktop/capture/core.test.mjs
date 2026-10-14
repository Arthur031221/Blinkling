import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SurfaceGuard,
  cropGeometry,
  deadline,
  deliverCapture,
  freezeDisplay,
} from "./core.mjs";

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

test("surface guard serializes captures and restores on failures without revealing hidden windows", async () => {
  const log = [];
  const window = (name, visible = true) => ({
    isDestroyed: () => false,
    isVisible: () => visible,
    hide: () => log.push(`hide ${name}`),
    showInactive: () => log.push(`show ${name}`),
  });
  const guard = new SurfaceGuard(
    () => [window("Blink"), window("chat"), window("hidden", false)],
    async () => {},
  );
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
    "hide Blink",
    "hide chat",
    "capture 1",
    "show Blink",
    "show chat",
    "hide Blink",
    "hide chat",
    "capture 2",
    "show Blink",
    "show chat",
  ]);
});

test("abort while queued never hides surfaces and destroyed surfaces are not restored", async () => {
  const controller = new AbortController();
  const log = [];
  let destroyed = false;
  const guard = new SurfaceGuard(
    () => [
      {
        isDestroyed: () => destroyed,
        isVisible: () => true,
        hide: () => log.push("hide"),
        showInactive: () => log.push("show"),
      },
    ],
    async () => {},
  );
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
  assert.deepEqual(log, ["hide"]);
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
