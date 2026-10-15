import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createKeySource, normalizeKey } from "./keys-source.mjs";

function fakeHook() {
  const hook = new EventEmitter();
  hook.started = 0;
  hook.stopped = 0;
  hook.start = () => hook.started++;
  hook.stop = () => hook.stopped++;
  return hook;
}

test("physical codes map to the names the state machine uses", () => {
  assert.deepEqual(normalizeKey(29), { key: "control", code: 29 });
  assert.deepEqual(normalizeKey(3613), { key: "control", code: 3613 });
  assert.deepEqual(normalizeKey(56), { key: "option", code: 56 });
  assert.deepEqual(normalizeKey(3640), { key: "option", code: 3640 });
  assert.deepEqual(normalizeKey(1), { key: "escape", code: 1 });
  assert.deepEqual(normalizeKey(42), { key: "shift", code: 42 });
  assert.deepEqual(normalizeKey(46), { key: "other", code: 46 });
});

test("hook events become normalized events and stop unsubscribes", async () => {
  const hook = fakeHook();
  const source = await createKeySource({ load: async () => hook });
  const seen = [];
  const off = source.subscribe((e) => seen.push(e));
  assert.equal(hook.started, 1);
  hook.emit("keydown", { keycode: 29 });
  hook.emit("keyup", { keycode: 29 });
  hook.emit("wheel", { rotation: 1, x: 3, y: 4 });
  hook.emit("mousemove", { x: 5, y: 6 });
  hook.emit("mousedown", { x: 7, y: 8, button: 1 });
  hook.emit("mouseup", { x: 7, y: 8, button: 1 });
  assert.deepEqual(seen, [
    { type: "keydown", key: "control", code: 29 },
    { type: "keyup", key: "control", code: 29 },
    { type: "wheel" },
    { type: "mousemove", x: 5, y: 6 },
    { type: "mousedown", x: 7, y: 8 },
    { type: "mouseup", x: 7, y: 8 },
  ]);
  off();
  hook.emit("keydown", { keycode: 29 });
  assert.equal(seen.length, 6);
  assert.equal(hook.stopped, 1, "the hook stops with its last listener");
});

test("a missing native hook yields a source that reports why", async () => {
  const source = await createKeySource({
    load: async () => {
      throw new Error("no hook for this platform");
    },
  });
  assert.equal(source.available, false);
  assert.match(source.reason, /no hook/);
  const off = source.subscribe(() => assert.fail("never called"));
  off();
});

test("two listeners share one hook", async () => {
  const hook = fakeHook();
  const source = await createKeySource({ load: async () => hook });
  const a = source.subscribe(() => {});
  const b = source.subscribe(() => {});
  assert.equal(hook.started, 1);
  a();
  assert.equal(hook.stopped, 0);
  b();
  assert.equal(hook.stopped, 1);
});
