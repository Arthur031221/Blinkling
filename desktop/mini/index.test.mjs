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
    changes: [],
    selected: [],
    images: [],
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
      changed: (open) => void log.changes.push(open),
      openImage: async (attachment) => void log.images.push(attachment),
      selection: () => options.selection ?? null,
      select: async (next) => {
        log.selected.push(next);
        if (options.selectFails) throw new Error("no");
        options.selection = next;
      },
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

test("the box follows Blink while it is carried and settles where Blink lands", async () => {
  const options = { blinkOn: { point: { x: 1280, y: 300 } } };
  const { controller, state, sent } = setup(options);
  await controller.open(entries());
  const rest = { ...state.bounds };
  controller.follow({ x: 1280, y: 500 });
  assert.equal(state.bounds.y - rest.y, 200);
  assert.equal(state.bounds.x, rest.x);
  options.blinkOn.point = { x: 1280, y: 600 };
  controller.follow();
  assert.equal(state.bounds.y - rest.y, 300, "released: at the resting place");
  const opens = sent.filter(([c]) => c === "blinkling:mini-open");
  assert.equal(opens.length, 1, "following does not replay the opening");
  controller.escape();
});

test("following with the box closed does nothing", () => {
  const { controller, state } = setup();
  controller.follow({ x: 10, y: 10 });
  assert.equal(state.bounds, null);
});

test("the host hears when the mini composer opens and when it closes (the fan stays shut meanwhile)", async () => {
  const { controller, fire, log } = setup();
  await controller.open(entries());
  assert.deepEqual(log.changes, [true]);
  await controller.open(entries());
  assert.deepEqual(log.changes, [true], "reopening while open is not a change");
  fire("blinkling:mini-escape");
  assert.deepEqual(log.changes, [true, false]);
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

test("a pick on a different display than Blink's still opens beside Blink, on Blink's display", async () => {
  const { controller, state } = setup({
    blinkOn: { point: { x: 3100, y: 500 }, workArea: second.workArea },
  });
  const picked = { x: 300, y: 200, width: 400, height: 260 };
  await controller.open(pickedOn(first, picked));
  const box = state.bounds;
  const area = second.workArea;
  assert.ok(box.x >= area.x && box.x + box.width <= area.x + area.width);
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

const viewOf = (sent) =>
  sent.filter(([c]) => c === "blinkling:mini-view").at(-1)[1];
const selection = { model: "haiku", effort: "low", permissionMode: "default" };

test("the view carries the session's selection, and a pick is applied through the host and shown", async () => {
  const { controller, sent, fire, log } = setup({ selection });
  await controller.open(entries());
  assert.deepEqual(viewOf(sent).selection, selection);
  const next = { model: "sonnet", effort: "high", permissionMode: "plan" };
  fire("blinkling:mini-select", next);
  assert.equal(viewOf(sent).selecting, true);
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(log.selected, [next]);
  assert.deepEqual(viewOf(sent).selection, next);
  assert.equal(viewOf(sent).selecting, false);
  assert.equal(viewOf(sent).notice, "");
  setLayer("mini", null);
});

test("a pick the session refuses leaves the old selection and says so", async () => {
  const { controller, sent, fire } = setup({ selection, selectFails: true });
  await controller.open(entries());
  fire("blinkling:mini-select", { model: "sonnet", effort: "high" });
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(viewOf(sent).selection, selection);
  assert.equal(viewOf(sent).notice, "switch-failed");
  setLayer("mini", null);
});

test("a malformed pick never reaches the host", async () => {
  const { controller, fire, log } = setup({ selection });
  await controller.open(entries());
  for (const bad of [
    null,
    "x",
    { model: 5, effort: "low" },
    { model: "haiku", effort: "huge" },
    { model: "haiku", effort: "low", permissionMode: "yolo" },
  ])
    fire("blinkling:mini-select", bad);
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(log.selected, []);
  setLayer("mini", null);
});

test("an attachment from the box becomes a chip with its preview; a bad one becomes a notice", async () => {
  const { controller, sent, fire } = setup({ selection });
  await controller.open([]);
  const attachment = {
    id: "n1",
    name: "n.png",
    mediaType: "image/png",
    data: "AAAA",
  };
  const thumb = "data:image/jpeg;base64,AAAA";
  fire("blinkling:mini-attach", { attachment, thumb });
  const shown = viewOf(sent);
  assert.deepEqual(
    shown.entries.map((e) => [e.id, e.type, e.thumb]),
    [["n1", "image", thumb]],
  );
  assert.equal(shown.notice, "");
  fire("blinkling:mini-attach", {
    attachment: { ...attachment, mediaType: "image/svg+xml", id: "n2" },
  });
  assert.equal(viewOf(sent).notice, "unsupported-file");
  assert.equal(viewOf(sent).entries.length, 1);
  fire("blinkling:mini-attach", { error: "too-large" });
  assert.equal(viewOf(sent).notice, "too-large");
  fire("blinkling:mini-attach", { error: "something <b>else</b>" });
  assert.equal(viewOf(sent).notice, "unreadable");
  setLayer("mini", null);
});

test("a preview that is not a small image data URL is dropped", async () => {
  const { controller, sent, fire } = setup({ selection });
  await controller.open([]);
  const attachment = {
    id: "n1",
    name: "n.png",
    mediaType: "image/png",
    data: "AAAA",
  };
  for (const thumb of [
    "https://example.com/x.png",
    "data:text/html;base64,AAAA",
    `data:image/png;base64,${"A".repeat(200_001)}`,
  ]) {
    fire("blinkling:mini-attach", {
      attachment: { ...attachment, id: `n${thumb.length}` },
      thumb,
    });
  }
  assert.ok(viewOf(sent).entries.every((e) => e.thumb === undefined));
  setLayer("mini", null);
});

const nextPick = () => [
  {
    id: "i2",
    kind: "image",
    attachment: { ...image, id: "b", data: "BBBB" },
    thumb: "data:image/png;base64,QQ==",
    taken: { kind: "image" },
  },
];
test("picks made while the box is open join its chips and keep the typed text", async () => {
  const { controller, sent, fire, log } = setup();
  await controller.open(entries());
  fire("blinkling:mini-input", "what is this");
  await controller.open(nextPick());
  const view = viewOf(sent);
  assert.deepEqual(
    view.entries.map((e) => e.id),
    ["i1", "i2"],
  );
  assert.equal(view.text, "what is this");
  assert.equal(view.entries[1].thumb, "data:image/png;base64,QQ==");
  assert.deepEqual(
    controller.entries().map((e) => e.id),
    ["i1", "i2"],
  );
  // Joining is not closing: the host never hears the box shut and open again.
  assert.deepEqual(log.changes, [true]);
  setLayer("mini", null);
});

test("a box that was closed starts over with only the new picks", async () => {
  const { controller, sent, fire } = setup();
  await controller.open(entries());
  fire("blinkling:mini-escape");
  await controller.open(nextPick());
  assert.deepEqual(
    viewOf(sent).entries.map((e) => e.id),
    ["i2"],
  );
  assert.equal(viewOf(sent).text, "");
  setLayer("mini", null);
});

test("joining past the attachment limit keeps the newest", async () => {
  const { controller, sent } = setup();
  const many = (from, n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${from + i}`,
      kind: "image",
      attachment: { ...image, id: `p${from + i}` },
      taken: { kind: "image" },
    }));
  await controller.open(many(0, 6));
  await controller.open(many(6, 6));
  const ids = viewOf(sent).entries.map((e) => e.id);
  assert.ok(ids.length <= 10, `${ids.length} chips`);
  assert.equal(ids.at(-1), "p11");
  setLayer("mini", null);
});

test("a thumbnail click hands that picture to the host to open in full", async () => {
  const { controller, fire, log } = setup();
  await controller.open(entries());
  fire("blinkling:mini-open-image", "i1");
  await Promise.resolve();
  assert.deepEqual(log.images, [image]);
  fire("blinkling:mini-open-image", "nope");
  await Promise.resolve();
  assert.equal(log.images.length, 1);
  setLayer("mini", null);
});
