import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createKeySource } from "./keys-uiohook.mjs";

function fakeHook() {
  const emitter = new EventEmitter();
  emitter.started = 0;
  emitter.start = () => emitter.started++;
  emitter.stop = () => emitter.started--;
  return emitter;
}

test("native key, mouse and wheel events become pick key events", async () => {
  const events = [];
  const uIOhook = fakeHook();
  const source = createKeySource({
    load: async () => ({ uIOhook }),
    handle: (e) => events.push(e),
  });
  assert.deepEqual(await source.start(), { ok: true });
  uIOhook.emit("keydown", { keycode: 29 });
  uIOhook.emit("wheel", { keycode: undefined });
  uIOhook.emit("mousedown", {});
  uIOhook.emit("keyup", { keycode: 29 });
  assert.deepEqual(events, [
    { type: "keydown", code: 29 },
    { type: "wheel", code: undefined },
    { type: "mousedown", code: undefined },
    { type: "keyup", code: 29 },
  ]);
});

test("starting twice listens once, and stop releases the hook", async () => {
  const uIOhook = fakeHook();
  const source = createKeySource({
    load: async () => ({ uIOhook }),
    handle: () => {},
  });
  await source.start();
  await source.start();
  assert.equal(uIOhook.started, 1);
  source.stop();
  assert.equal(uIOhook.started, 0);
  assert.equal(uIOhook.listenerCount("keydown"), 0);
  assert.equal(source.started(), false);
});

test("a native module that will not load is reported, not thrown", async () => {
  const errors = [];
  const source = createKeySource({
    load: async () => {
      throw new Error("no uiohook");
    },
    handle: () => {},
    onError: (e) => errors.push(e.message),
  });
  const result = await source.start();
  assert.equal(result.ok, false);
  assert.deepEqual(errors, ["no uiohook"]);
});
