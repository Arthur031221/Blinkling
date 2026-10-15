import test from "node:test";
import assert from "node:assert/strict";
import { createMiniController } from "./index.mjs";
import { topLayer, setLayer, escape } from "../shared/escape.mjs";

const image = {
  id: "a",
  name: "Selection.png",
  mediaType: "image/png",
  data: "AAAA",
};

function setup(options = {}) {
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
  const log = {
    remembered: 0,
    restored: 0,
    activated: 0,
    sends: [],
    opened: [],
    closed: [],
  };
  const controller = createMiniController({
    win,
    ipc: { on: (channel, fn) => handlers.set(channel, fn) },
    locale: "zh-TW",
    theme: () => options.theme ?? "light",
    focus: {
      remember: options.remember ?? (async () => void log.remembered++),
      activate: () => void log.activated++,
      restore: () => void log.restored++,
    },
    workArea: () =>
      options.blinkOn?.workArea ?? { x: 0, y: 0, width: 1280, height: 800 },
    blinkPoint: () => options.blinkOn?.point ?? { x: 1280, y: 400 },
    host: {
      send: async (turn) => void log.sends.push(turn),
      openComposer: (seed) => void log.opened.push(seed),
      closed: (reason) => void log.closed.push(reason),
    },
    autoExplain: () => false,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimer: () => {},
  });
  const fire = (channel, value, sender = wc) =>
    handlers.get(channel)({ sender }, value);
  return { controller, sent, state, log, fire, timers, wc };
}
const entries = () => [
  { id: "i1", kind: "image", attachment: image, taken: { kind: "image" } },
];

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

test("opening shows the window before the previous app's focus has been remembered", async () => {
  let remembered;
  const gate = new Promise((resolve) => (remembered = resolve));
  const { controller, state, log } = setup({ remember: () => gate });
  const opening = controller.open(entries());
  assert.equal(state.visible, true, "visible without waiting for focus");
  assert.equal(log.activated, 0, "the keyboard is taken only once remembered");
  remembered();
  await opening;
  assert.equal(log.activated, 1);
  setLayer("mini", null);
});

test("pixels that arrive after the window opened are filled into their chip", async () => {
  const { controller, sent } = setup();
  await controller.open([
    { id: "p1", kind: "image", pending: true, taken: { kind: "image" } },
  ]);
  controller.fill({
    id: "p1",
    kind: "image",
    attachment: image,
    taken: { kind: "image" },
    thumb: "data:y",
  });
  const view = sent.filter(([c]) => c === "blinkling:mini-view").at(-1)[1];
  assert.equal(view.entries[0].thumb, "data:y");
  assert.equal(view.entries[0].pending, undefined);
  setLayer("mini", null);
});

test("when the last waiting pick turns out to have no pixels the mini closes", async () => {
  const { controller, log } = setup();
  await controller.open([
    { id: "p1", kind: "image", pending: true, taken: { kind: "image" } },
  ]);
  controller.drop("p1");
  assert.deepEqual(log.closed, ["escape"]);
});

const first = {
  id: "1",
  bounds: { x: 0, y: 0, width: 1280, height: 800 },
  workArea: { x: 0, y: 0, width: 1280, height: 800 },
};
const second = {
  id: "2",
  bounds: { x: 1280, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1280, y: 0, width: 1920, height: 1040 },
};
const pickedOn = (display, bounds) => [
  {
    id: "i1",
    kind: "image",
    attachment: image,
    taken: { kind: "image", display, bounds },
  },
];
const hits = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

test("a pick on a different display than Blink's opens on the pick's display, clear of the pick", async () => {
  const { controller, state } = setup({
    blinkOn: { point: { x: 3100, y: 500 }, workArea: second.workArea },
  });
  const picked = { x: 300, y: 200, width: 400, height: 260 };
  await controller.open(pickedOn(first, picked));
  const box = state.bounds;
  assert.ok(box.x + box.width <= first.workArea.width, "on the pick's display");
  assert.equal(hits(box, picked), false, "not over the pick");
  setLayer("mini", null);
});

test("on the same display it keeps off Blink's body as well as the pick", async () => {
  const { controller, state } = setup();
  const picked = { x: 700, y: 330, width: 400, height: 140 };
  await controller.open(pickedOn(first, picked));
  assert.equal(hits(state.bounds, picked), false);
  assert.equal(
    hits(state.bounds, { x: 1206, y: 258, width: 148, height: 152 }),
    false,
  );
  setLayer("mini", null);
});

test("it grows out of Blink: the open message says where from, relative to the box", async () => {
  const { controller, state, sent } = setup();
  await controller.open(entries());
  const open = sent.find(([c]) => c === "blinkling:mini-open")[1];
  assert.equal(open.origin.x, 1280 - state.bounds.x);
  assert.ok(Number.isFinite(open.origin.y));
  setLayer("mini", null);
});

test("it says whether it sits over any of the given rectangles", async () => {
  const { controller, state } = setup();
  assert.equal(
    controller.covers([{ x: 0, y: 0, width: 5000, height: 5000 }]),
    false,
    "closed: covers nothing",
  );
  await controller.open(entries());
  assert.equal(controller.covers([state.bounds]), true);
  assert.equal(
    controller.covers([{ x: 0, y: 0, width: 10, height: 10 }]),
    false,
  );
  setLayer("mini", null);
});

test("the window is told the shell's theme with every open, since its own media query does not follow it", async () => {
  const { controller, sent } = setup({ theme: "dark" });
  await controller.open([
    {
      id: "a",
      kind: "text",
      attachment: { ...image, mediaType: "text/plain" },
    },
  ]);
  const init = sent.find(([channel]) => channel === "blinkling:mini-init");
  assert.equal(init[1].theme, "dark");
});
