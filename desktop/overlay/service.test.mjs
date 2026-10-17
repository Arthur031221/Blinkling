import "../shared/test-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { OverlayService } from "./service.mjs";
import { StalenessWatch } from "./staleness.mjs";

const bounds = { x: 0, y: 0, width: 1280, height: 800 };
const display = { id: "1", bounds, scaleFactor: 1 };
const drawings = [{ n: 1, rect: { x: 10, y: 10, width: 50, height: 20 } }];

function rig({ escape, reserve, created = [] } = {}) {
  const sent = [],
    released = [],
    shortcuts = new Map();
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    ignoring: [],
    setIgnoreMouseEvents(...args) {
      window.ignoring.push(args);
    },
    webContents: { send: (...args) => sent.push(args) },
  });
  const displays = Object.assign(new EventEmitter(), {
    getAllDisplays: () => [{ id: 1, scaleFactor: 1, bounds }],
  });
  const overlay = new OverlayService({
    create: async (...args) => {
      created.push(args);
      return window;
    },
    reserve,
    release: (w) => released.push(w),
    escape:
      escape === null
        ? null
        : {
            register: (key, fn) => shortcuts.set(key, fn),
            unregister: (key) => shortcuts.delete(key),
          },
    displays,
    masks: () => [],
    log: () => {},
  });
  return { overlay, window, sent, released, shortcuts };
}

test("a dismissed overlay is handed back for reuse, never closed", async () => {
  const r = rig();
  await r.overlay.show({ display }, drawings);
  r.overlay.dismiss("user");
  assert.deepEqual(r.released, [r.window]);
  assert.equal(r.overlay.window, null);
});

test("marks need no screenshot: a capture of just the display is enough", async () => {
  const r = rig();
  assert.equal(await r.overlay.show({ display }, drawings), true);
  assert.equal(r.overlay.capture.image, undefined);
});

test("commands reach the overlay window only while something is shown", async () => {
  const r = rig();
  r.overlay.command("pulse", 1);
  await r.overlay.show({ display }, drawings);
  r.overlay.command("pulse", 1);
  r.overlay.command("focus", [0, 2]);
  assert.deepEqual(r.sent, [
    ["blinkling:overlay:command", { name: "pulse", arg: 1 }],
    ["blinkling:overlay:command", { name: "focus", arg: [0, 2] }],
  ]);
  assert.throws(() => r.overlay.command("delete-everything"), /command/);
});

test("the window is click-through until a badge asks for the click", async () => {
  const r = rig();
  await r.overlay.show({ display }, drawings);
  r.overlay.setInteractive(true);
  r.overlay.setInteractive(false);
  assert.deepEqual(r.window.ignoring, [
    [false, { forward: true }],
    [true, { forward: true }],
  ]);
});

test("a click on a badge is re-emitted as mark-click", async () => {
  const r = rig();
  const clicks = [];
  r.overlay.on("mark-click", (n) => clicks.push(n));
  await r.overlay.show({ display }, drawings);
  r.window.emit("mark-click", 1);
  r.overlay.dismiss();
  r.window.emit("mark-click", 1);
  assert.deepEqual(clicks, [1]);
});

test("the shell owns Esc when it hands the service no shortcut", async () => {
  const r = rig({ escape: null });
  await r.overlay.show({ display }, drawings);
  assert.equal(r.shortcuts.size, 0);
  r.overlay.dismiss("user");
});

test("the staleness watch leaves live marks alone: there is no screenshot to compare", async () => {
  const r = rig();
  let decoded = 0;
  const watch = new StalenessWatch({
    overlay: r.overlay,
    intervalMs: 1_000_000,
    decode: () => (decoded++, new Uint8Array()),
    grab: async () => new Uint8Array(),
  });
  await r.overlay.show({ display }, drawings);
  assert.equal(decoded, 0);
  assert.equal(watch.detector ?? null, null);
  watch.dispose();
});

test("labels keep off the room a window will take, as well as off windows now up", async () => {
  const created = [];
  const r = rig({
    created,
    reserve: () => [{ x: 700, y: 40, width: 440, height: 520 }],
  });
  await r.overlay.show({ display }, drawings);
  const [, , options] = created[0];
  assert.deepEqual(options.avoid, [{ x: 700, y: 40, width: 440, height: 520 }]);
});
