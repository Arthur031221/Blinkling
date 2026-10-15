import test from "node:test";
import assert from "node:assert/strict";
import { createMiniController } from "./index.mjs";
import { topLayer, setLayer, escape } from "../shared/escape.mjs";

const image = { id: "a", name: "Selection.png", mediaType: "image/png", data: "AAAA" };

function setup() {
  const sent = [];
  const handlers = new Map();
  const timers = [];
  const wc = { send: (channel, value) => sent.push([channel, value]) };
  const state = { visible: false, focused: false, bounds: null, hides: 0 };
  const win = {
    webContents: wc,
    isDestroyed: () => false,
    isVisible: () => state.visible,
    isFocused: () => state.focused,
    showInactive: () => (state.visible = true),
    hide: () => ((state.visible = false), state.hides++),
    focus: () => (state.focused = true),
    setBounds: (b) => (state.bounds = b),
  };
  const log = { remembered: 0, restored: 0, activated: 0, sends: [], opened: [], closed: [] };
  const controller = createMiniController({
    win,
    ipc: { on: (channel, fn) => handlers.set(channel, fn) },
    locale: "zh-TW",
    focus: {
      remember: async () => void log.remembered++,
      activate: () => void log.activated++,
      restore: () => void log.restored++,
    },
    workArea: () => ({ x: 0, y: 0, width: 1280, height: 800 }),
    blinkPoint: () => ({ x: 1280, y: 400 }),
    host: {
      send: async (turn) => void log.sends.push(turn),
      openComposer: (seed) => void log.opened.push(seed),
      closed: (reason) => void log.closed.push(reason),
    },
    autoExplain: () => false,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimer: () => {},
  });
  const fire = (channel, value, sender = wc) => handlers.get(channel)({ sender }, value);
  return { controller, sent, state, log, fire, timers, wc };
}
const entries = () => [{ id: "i1", kind: "image", attachment: image, taken: { kind: "image" } }];

test("opening shows the view, places the window beside Blink and takes the keyboard", async () => {
  const { controller, sent, state, log } = setup();
  await controller.open(entries());
  assert.equal(log.remembered, 1);
  assert.equal(state.visible, true);
  assert.ok(state.bounds.x + state.bounds.width <= 1280);
  const view = sent.find(([c]) => c === "blinkling:mini-view")[1];
  assert.equal(view.chips.length, 3);
  assert.ok(sent.some(([c]) => c === "blinkling:mini-open"));
  assert.equal(topLayer(), "mini");
  setLayer("mini", null);
});

test("Enter sends the default ask, closes, and returns the keyboard", async () => {
  const { controller, fire, log, sent } = setup();
  await controller.open(entries());
  fire("blinkling:mini-submit");
  await new Promise((r) => setImmediate(r));
  assert.equal(log.sends.length, 1);
  assert.equal(log.sends[0].source, "quick-ask");
  assert.equal(log.restored, 1);
  assert.deepEqual(log.closed, ["sent"]);
  assert.ok(sent.some(([c]) => c === "blinkling:mini-close"));
  assert.equal(topLayer(), null);
});

test("Escape discards and returns the keyboard; the window hides after the reverse transition", async () => {
  const { controller, fire, log, state, timers } = setup();
  await controller.open(entries());
  fire("blinkling:mini-escape");
  assert.equal(log.restored, 1);
  assert.equal(log.sends.length, 0);
  assert.equal(state.visible, true, "still visible while the card fades out");
  timers.at(-1).fn();
  assert.equal(state.visible, false);
});

test("reopening before the hide timer fires keeps the window", async () => {
  const { controller, fire, state, timers } = setup();
  await controller.open(entries());
  fire("blinkling:mini-escape");
  const hide = timers.at(-1);
  await controller.open(entries());
  hide.fn();
  assert.equal(state.visible, true);
});

test("growing into the full composer does not take the keyboard from it", async () => {
  const { controller, fire, log } = setup();
  await controller.open(entries());
  fire("blinkling:mini-input", "x".repeat(400));
  assert.equal(log.opened.length, 1);
  assert.equal(log.restored, 0);
});

test("messages from any other sender are ignored", async () => {
  const { controller, fire, log } = setup();
  await controller.open(entries());
  fire("blinkling:mini-submit", undefined, {});
  await new Promise((r) => setImmediate(r));
  assert.equal(log.sends.length, 0);
});

test("the shared Escape closes the mini composer when it is the top layer", async () => {
  const { controller, log } = setup();
  await controller.open(entries());
  assert.equal(escape(), "mini");
  assert.deepEqual(log.closed, ["escape"]);
});

test("removing a chip redraws the view without it", async () => {
  const { controller, fire, sent } = setup();
  await controller.open(entries());
  fire("blinkling:mini-remove", "i1");
  const views = sent.filter(([c]) => c === "blinkling:mini-view");
  assert.equal(views.at(-1)[1].entries.length, 0);
});

test("a size report from the page moves and resizes the window", async () => {
  const { controller, fire, state } = setup();
  await controller.open(entries());
  fire("blinkling:mini-size", 260);
  assert.equal(state.bounds.height, 260);
});
