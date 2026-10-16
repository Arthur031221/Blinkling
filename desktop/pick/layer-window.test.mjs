import test from "node:test";
import assert from "node:assert/strict";
import { createLayers } from "./layer-window.mjs";

function fakes(displays, extra = {}) {
  const log = { windows: [], handlers: {}, timers: [] };
  class Win {
    constructor(options) {
      this.options = options;
      this.calls = [];
      this.sent = [];
      this.destroyed = false;
      this.webContents = {
        once: () => {},
        send: (channel, value) => this.sent.push([channel, value]),
      };
      log.windows.push(this);
    }
    loadFile() {
      return Promise.resolve();
    }
    setIgnoreMouseEvents(v) {
      this.calls.push(["ignore", v]);
    }
    showInactive() {
      this.calls.push(["show"]);
    }
    hide() {
      this.calls.push(["hide"]);
    }
    setBounds(b) {
      this.calls.push(["bounds", b]);
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const listeners = {};
  const screen = {
    getAllDisplays: () => displays,
    on: (name, fn) => (listeners[name] = fn),
    removeListener: (name) => delete listeners[name],
  };
  const ipcMain = { on: (channel, fn) => (log.handlers[channel] = fn) };
  const pointer = [];
  const layers = createLayers({
    BrowserWindow: Win,
    screen,
    ipcMain,
    options: { transparent: true },
    page: "layer.html",
    onPointer: (p) => pointer.push(p),
    setTimer: (fn, ms) => (log.timers.push({ fn, ms }), log.timers.length),
    clearTimer: () => {},
    ...extra,
  });
  const ready = (win) =>
    log.handlers["blinkling:pick-ready"]({ sender: win.webContents });
  return { log, layers, pointer, listeners, ready, screen };
}
const d1 = { id: 1, bounds: { x: 0, y: 0, width: 1280, height: 800 } };
const d2 = { id: 2, bounds: { x: 1280, y: 0, width: 1920, height: 1080 } };

test("a hidden, non-focusable window is made for every display at start", () => {
  const { log } = fakes([d1, d2]);
  assert.equal(log.windows.length, 2);
  for (const w of log.windows) {
    assert.equal(w.options.show, false);
    assert.equal(w.options.focusable, false);
    assert.equal(w.options.transparent, true);
    assert.ok(!w.calls.some(([c]) => c === "show"));
  }
  assert.deepEqual(log.windows[1].options.x, 1280);
});

test("raising and dropping reuses the same windows", () => {
  const { log, layers, ready } = fakes([d1, d2]);
  log.windows.forEach(ready);
  for (let i = 0; i < 3; i++) {
    layers.show(d2, { x: 1400, y: 200 });
    layers.hide();
  }
  assert.equal(log.windows.length, 2, "no window was created after start");
  assert.equal(log.windows[1].calls.filter(([c]) => c === "show").length, 3);
  assert.equal(log.windows[0].calls.filter(([c]) => c === "show").length, 0);
});

test("show takes the pointer, hide gives it back and tells the page to clear", () => {
  const { log, layers, ready } = fakes([d1]);
  ready(log.windows[0]);
  layers.show(d1, { x: 5, y: 6 });
  assert.deepEqual(
    log.windows[0].calls.filter(([c]) => c === "ignore").at(-1),
    ["ignore", false],
  );
  assert.deepEqual(log.windows[0].sent.at(-1), [
    "blinkling:pick-message",
    { channel: "cursor", value: { x: 5, y: 6 } },
  ]);
  layers.hide();
  assert.deepEqual(
    log.windows[0].calls.filter(([c]) => c === "ignore").at(-1),
    ["ignore", true],
  );
  assert.equal(log.windows[0].sent.at(-1)[1].channel, "clear");
  assert.deepEqual(log.windows[0].calls.at(-1), ["hide"]);
});

test("messages sent before the page is ready are delivered when it is", () => {
  const { log, layers, ready } = fakes([d1]);
  layers.show(d1, { x: 1, y: 2 });
  assert.equal(log.windows[0].sent.length, 0);
  ready(log.windows[0]);
  assert.equal(log.windows[0].sent.length, 1);
});

test("pointer events from the page reach the controller only while raised, and only from a layer", () => {
  const { log, layers, ready, pointer } = fakes([d1]);
  ready(log.windows[0]);
  const from = (sender, payload) =>
    log.handlers["blinkling:pick-pointer"]({ sender }, payload);
  from(log.windows[0].webContents, { type: "down", x: 1, y: 2 });
  assert.equal(pointer.length, 0, "not raised");
  layers.show(d1, { x: 0, y: 0 });
  from({}, { type: "down", x: 1, y: 2 });
  from(log.windows[0].webContents, { type: "evil", x: 1, y: 2 });
  from(log.windows[0].webContents, { type: "move", x: Infinity, y: 2 });
  assert.equal(pointer.length, 0);
  from(log.windows[0].webContents, { type: "move", x: 3, y: 4 });
  assert.deepEqual(pointer, [{ type: "move", x: 3, y: 4 }]);
});

test("a flight runs click-through on the display of the first thumbnail and ends when the page says so", async () => {
  const { log, layers, ready } = fakes([d1, d2]);
  log.windows.forEach(ready);
  const flying = layers.flight(
    [{ id: "a", bounds: { x: 1500, y: 100, width: 100, height: 60 } }],
    { x: 1200, y: 400 },
  );
  const win = log.windows[1];
  assert.deepEqual(win.calls.filter(([c]) => c === "ignore").at(-1), [
    "ignore",
    true,
  ]);
  const message = win.sent.at(-1)[1];
  assert.equal(message.channel, "flight");
  assert.deepEqual(layers.flying(), [win], "kept over Blink while it flies");
  assert.deepEqual(
    message.value.to,
    { x: 1280, y: 400 },
    "clamped into that display",
  );
  log.handlers["blinkling:pick-flight-done"](
    { sender: win.webContents },
    message.value.token,
  );
  await flying;
  assert.deepEqual(layers.flying(), []);
  assert.deepEqual(win.calls.at(-1), ["hide"]);
});

test("a pick that starts while a flight is still landing keeps its layer: the flight's end must not hide it", async () => {
  const { log, layers, ready, pointer } = fakes([d1]);
  const win = log.windows[0];
  const from = (sender, payload) =>
    log.handlers["blinkling:pick-pointer"]({ sender }, payload);
  ready(win);
  const flying = layers.flight(
    [{ id: "a", bounds: { x: 10, y: 10, width: 10, height: 10 } }],
    { x: 100, y: 100 },
  );
  const token = win.sent.at(-1)[1].value.token;
  layers.show(d1, { x: 50, y: 50 });
  log.handlers["blinkling:pick-flight-done"](
    { sender: win.webContents },
    token,
  );
  await flying;
  assert.notDeepEqual(win.calls.at(-1), ["hide"], "still shown");
  from(win.webContents, { type: "down", x: 50, y: 50 });
  assert.deepEqual(
    pointer,
    [{ type: "down", x: 50, y: 50 }],
    "still takes the pointer",
  );
  layers.hide();
  assert.deepEqual(win.calls.at(-1), ["hide"], "the next hide still works");
});

test("a flight that starts after a new pick took the layer flies over it and leaves it live", async () => {
  const { log, layers, ready, pointer } = fakes([d1]);
  const win = log.windows[0];
  const from = (sender, payload) =>
    log.handlers["blinkling:pick-pointer"]({ sender }, payload);
  ready(win);
  layers.show(d1, { x: 50, y: 50 });
  const flying = layers.flight(
    [{ id: "a", bounds: { x: 10, y: 10, width: 10, height: 10 } }],
    { x: 100, y: 100 },
  );
  const message = win.sent.at(-1)[1];
  assert.equal(message.channel, "flight");
  assert.deepEqual(
    win.calls.filter(([c]) => c === "ignore").at(-1),
    ["ignore", false],
    "still takes the pointer",
  );
  log.handlers["blinkling:pick-flight-done"](
    { sender: win.webContents },
    message.value.token,
  );
  await flying;
  assert.notDeepEqual(win.calls.at(-1), ["hide"]);
  from(win.webContents, { type: "up", x: 5, y: 6 });
  assert.deepEqual(pointer, [{ type: "up", x: 5, y: 6 }]);
  layers.hide();
  assert.deepEqual(win.calls.at(-1), ["hide"]);
});

test("a flight that never reports back is cut off", async () => {
  const { log, layers, ready } = fakes([d1]);
  ready(log.windows[0]);
  const flying = layers.flight(
    [{ id: "a", bounds: { x: 10, y: 10, width: 10, height: 10 } }],
    { x: 100, y: 100 },
  );
  log.timers.at(-1).fn();
  await flying;
  assert.deepEqual(log.windows[0].calls.at(-1), ["hide"]);
});

test("plugging a display in or out adds and removes its window", () => {
  const displays = [d1];
  const { log, listeners, layers } = fakes(displays);
  displays.push(d2);
  listeners["display-added"]();
  assert.equal(layers.count(), 2);
  displays.pop();
  listeners["display-removed"]();
  assert.equal(layers.count(), 1);
  assert.equal(log.windows[1].destroyed, true);
});

test("each time a layer rises it is put back on top of the X stack", () => {
  const raised = [];
  const { log, layers, ready } = fakes([d1, d2], {
    raise: (windows) => raised.push(windows),
  });
  log.windows.forEach(ready);
  layers.show(d2, { x: 1400, y: 200 });
  layers.show(d2, { x: 1400, y: 200 });
  assert.deepEqual(raised, [[log.windows[1]], [log.windows[1]]]);
});
