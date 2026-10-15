import test from "node:test";
import assert from "node:assert/strict";
import { createWelcomeController, WELCOME_SIZE } from "./index.mjs";
import { createOnce } from "../pick/once.mjs";
import { duration } from "../shared/motion.mjs";

function setup({ platform = "linux", pick = "control", status = "granted", loaded } = {}) {
  const sent = [];
  const handlers = new Map();
  const listeners = new Map();
  const timers = [];
  const sender = { send: (channel, value) => sent.push([channel, value]) };
  const state = { visible: false, focused: false, bounds: null, hides: 0 };
  const win = {
    webContents: sender,
    isDestroyed: () => false,
    isVisible: () => state.visible,
    showInactive: () => (state.visible = true),
    hide: () => ((state.visible = false), state.hides++),
    focus: () => (state.focused = true),
    setBounds: (b) => (state.bounds = b),
  };
  const log = { requested: 0, opened: 0, restored: 0, remembered: 0 };
  const flags = new Map();
  let current = status;
  const controller = createWelcomeController({
    win,
    loaded,
    ipc: {
      on: (channel, fn) => listeners.set(channel, fn),
      handle: (channel, fn) => handlers.set(channel, fn),
    },
    locale: "ja",
    platform,
    pickKey: { get: () => pick },
    permission: {
      status: () => current,
      request: async () => {
        log.requested++;
        current = "granted";
      },
      open: async () => {
        log.opened++;
      },
    },
    once: createOnce({
      get: (key) => flags.get(key),
      set: (key, value) => flags.set(key, value),
    }),
    focus: {
      remember: async () => void log.remembered++,
      activate: () => {},
      restore: () => void log.restored++,
    },
    workArea: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    setTimer: (fn, ms) => {
      const timer = { fn, ms };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      const at = timers.indexOf(timer);
      if (at >= 0) timers.splice(at, 1);
    },
  });
  const ask = (channel, ...args) =>
    handlers.get(channel)({ sender }, ...args);
  const tell = (channel, ...args) =>
    listeners.get(channel)({ sender }, ...args);
  return { controller, sent, state, timers, log, flags, ask, tell, handlers, listeners };
}

test("the first start opens the welcome once, centred, and never again", async () => {
  const t = setup();
  assert.equal(await t.controller.openFirstTime(), true);
  assert.equal(t.state.visible, true);
  assert.deepEqual(t.state.bounds, {
    x: (1920 - WELCOME_SIZE.width) / 2,
    y: (1080 - WELCOME_SIZE.height) / 2,
    ...WELCOME_SIZE,
  });
  t.tell("blinkling:welcome-close");
  t.timers[0].fn();
  assert.equal(await t.controller.openFirstTime(), false);
  assert.equal(t.state.visible, false);
});

test("a later replay opens it again whether or not the first start happened", async () => {
  const t = setup();
  await t.controller.open();
  t.tell("blinkling:welcome-close");
  t.timers[0].fn();
  await t.controller.open();
  assert.equal(t.state.visible, true);
  assert.equal(t.controller.isOpen, true);
});

test("the view carries locale, the pick key name and the permission", async () => {
  assert.deepEqual(await setup().ask("blinkling:welcome-ready"), {
    locale: "ja",
    platform: "linux",
    keyName: "Ctrl",
    permission: "unneeded",
  });
  const mac = await setup({ platform: "darwin", pick: "option", status: "denied" }).ask(
    "blinkling:welcome-ready",
  );
  assert.equal(mac.keyName, "Option");
  assert.equal(mac.permission, "denied");
  const control = await setup({ platform: "darwin" }).ask("blinkling:welcome-ready");
  assert.equal(control.keyName, "Control");
  assert.equal(control.permission, "granted");
});

test("on macOS the permission step can ask, open System Settings and re-check", async () => {
  const t = setup({ platform: "darwin", status: "not-determined" });
  assert.equal(await t.ask("blinkling:welcome-permission", "refresh"), "not-determined");
  assert.equal(await t.ask("blinkling:welcome-permission", "request"), "granted");
  assert.equal(t.log.requested, 1);
  await t.ask("blinkling:welcome-permission", "open");
  assert.equal(t.log.opened, 1);
});

test("elsewhere no permission is asked for and nothing is opened", async () => {
  const t = setup({ platform: "win32", status: "denied" });
  assert.equal(await t.ask("blinkling:welcome-permission", "request"), "unneeded");
  await t.ask("blinkling:welcome-permission", "open");
  assert.equal(t.log.requested + t.log.opened, 0);
});

test("unknown permission actions and untrusted senders are refused", async () => {
  const t = setup({ platform: "darwin", status: "denied" });
  assert.equal(await t.ask("blinkling:welcome-permission", "format"), null);
  assert.equal(
    await t.handlers.get("blinkling:welcome-permission")({ sender: {} }, "request"),
    null,
  );
  assert.equal(await t.handlers.get("blinkling:welcome-ready")({ sender: {} }), null);
  t.listeners.get("blinkling:welcome-close")({ sender: {} });
  assert.equal(t.controller.isOpen, false);
});

test("closing plays the reverse, hides after the base duration and restores focus", async () => {
  const t = setup();
  await t.controller.open();
  t.tell("blinkling:welcome-close");
  assert.equal(t.sent.at(-1)[0], "blinkling:welcome-close");
  assert.equal(t.timers[0].ms, duration.base);
  assert.equal(t.state.visible, true);
  t.timers[0].fn();
  assert.equal(t.state.visible, false);
  assert.equal(t.log.restored, 1);
});

test("reopening during the close cancels the hide", async () => {
  const t = setup();
  await t.controller.open();
  t.tell("blinkling:welcome-close");
  await t.controller.open();
  assert.equal(t.timers.length, 0);
  assert.equal(t.state.visible, true);
});

test("opening twice does not stack", async () => {
  const t = setup();
  await t.controller.open();
  const count = t.sent.length;
  await t.controller.open();
  assert.equal(t.sent.length, count);
  assert.equal(t.log.remembered, 1);
});

test("opening before the page has loaded waits for it, so the page sees the open message", async () => {
  let loaded;
  const page = new Promise((resolve) => (loaded = resolve));
  const { controller, sent, state } = setup({ loaded: page });
  const opening = controller.open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.visible, false);
  assert.deepEqual(sent, []);
  loaded();
  await opening;
  assert.deepEqual(
    sent.map(([channel]) => channel),
    ["blinkling:welcome-state", "blinkling:welcome-open"],
  );
  assert.equal(state.visible, true);
});

test("closing while the page is still loading leaves the window hidden", async () => {
  let loaded;
  const page = new Promise((resolve) => (loaded = resolve));
  const { controller, sent, state } = setup({ loaded: page });
  const opening = controller.open();
  controller.close();
  loaded();
  await opening;
  assert.equal(state.visible, false);
  assert.deepEqual(
    sent.map(([channel]) => channel),
    ["blinkling:welcome-close"],
  );
});

test("a reopen while loading is announced once", async () => {
  let loaded;
  const page = new Promise((resolve) => (loaded = resolve));
  const { controller, sent } = setup({ loaded: page });
  const first = controller.open();
  controller.close();
  const second = controller.open();
  loaded();
  await Promise.all([first, second]);
  assert.equal(
    sent.filter(([channel]) => channel === "blinkling:welcome-open").length,
    1,
  );
});
