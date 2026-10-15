import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsController } from "./index.mjs";
import { createSettingsStore } from "./store.mjs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function setup({
  platform = "linux",
  hotkey = "Alt+Shift+X",
  loaded,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-settings-ui-"));
  const sent = [];
  const handlers = new Map();
  const listeners = new Map();
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
    hotkeys: [],
    pickKeys: [],
    welcome: 0,
    guide: 0,
    restored: 0,
    remembered: 0,
  };
  let currentHotkey = hotkey;
  let currentPick = "control";
  const controller = createSettingsController({
    win,
    loaded,
    ipc: {
      on: (channel, fn) => listeners.set(channel, fn),
      handle: (channel, fn) => handlers.set(channel, fn),
    },
    locale: "zh-TW",
    platform,
    version: "3.0.0",
    store: createSettingsStore(join(dir, "settings.json")),
    hotkey: {
      get: () => currentHotkey,
      set: async (accelerator) => {
        log.hotkeys.push(accelerator);
        if (accelerator === "Control+Shift+S")
          return { ok: false, reason: "clash" };
        if (accelerator === "F") return { ok: false, reason: "invalid" };
        currentHotkey = accelerator;
        return { ok: true };
      },
    },
    pickKey: {
      get: () => currentPick,
      set: (name) => {
        log.pickKeys.push(name);
        if (!["control", "option"].includes(name)) return false;
        currentPick = name;
        return true;
      },
    },
    host: {
      welcome: () => void log.welcome++,
      guide: () => void log.guide++,
    },
    focus: {
      remember: async () => void log.remembered++,
      activate: () => {},
      restore: () => void log.restored++,
    },
    workArea: () => ({ x: 0, y: 0, width: 1280, height: 800 }),
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimer: () => {},
  });
  const ask = (channel, value, sender = wc) =>
    handlers.get(channel)({ sender }, value);
  const fire = (channel, value, sender = wc) =>
    listeners.get(channel)({ sender }, value);
  return { controller, sent, state, log, ask, fire, timers, wc, dir };
}

test("opening shows the window centred in the work area and sends the state", async () => {
  const { controller, state, sent, log } = await setup();
  await controller.open();
  assert.equal(state.visible, true);
  assert.equal(log.remembered, 1);
  const { x, y, width, height } = state.bounds;
  assert.equal(x + width / 2, 640);
  assert.equal(y + height / 2, 400);
  assert.ok(sent.some(([c]) => c === "blinkling:settings-open"));
  assert.equal(controller.isOpen, true);
});

test("the state has the hotkey, the start setting and the system language", async () => {
  const { ask } = await setup();
  const view = await ask("blinkling:settings-ready");
  assert.equal(view.locale, "zh-TW");
  assert.equal(view.hotkey, "Alt+Shift+X");
  assert.equal(view.startWithClaudeCode, true);
  assert.equal(view.version, "3.0.0");
});

test("the pick key shows on a Mac only", async () => {
  const mac = await setup({ platform: "darwin" });
  assert.deepEqual((await mac.ask("blinkling:settings-ready")).pickKeys, [
    "control",
    "option",
  ]);
  assert.equal((await mac.ask("blinkling:settings-ready")).pickKey, "control");
  const linux = await setup({ platform: "linux" });
  assert.equal((await linux.ask("blinkling:settings-ready")).pickKeys, null);
  const refused = await linux.ask("blinkling:settings-set", {
    key: "pickKey",
    value: "option",
  });
  assert.equal(refused.ok, false);
  assert.deepEqual(linux.log.pickKeys, []);
});

test("changing the pick key on a Mac saves it", async () => {
  const { ask, log } = await setup({ platform: "darwin" });
  const result = await ask("blinkling:settings-set", {
    key: "pickKey",
    value: "option",
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.pickKey, "option");
  assert.deepEqual(log.pickKeys, ["option"]);
});

test("a new hotkey is registered and shown; a clash says why and keeps the old key", async () => {
  const { ask } = await setup();
  const ok = await ask("blinkling:settings-set", {
    key: "hotkey",
    value: "Alt+Shift+K",
  });
  assert.deepEqual([ok.ok, ok.state.hotkey], [true, "Alt+Shift+K"]);
  const clash = await ask("blinkling:settings-set", {
    key: "hotkey",
    value: "Control+Shift+S",
  });
  assert.deepEqual([clash.ok, clash.reason], [false, "clash"]);
  assert.equal(clash.state.hotkey, "Alt+Shift+K");
  const invalid = await ask("blinkling:settings-set", {
    key: "hotkey",
    value: "F",
  });
  assert.equal(invalid.reason, "invalid");
});

test("start with Claude Code is stored for the launcher", async () => {
  const { ask, dir } = await setup();
  const off = await ask("blinkling:settings-set", {
    key: "startWithClaudeCode",
    value: false,
  });
  assert.equal(off.state.startWithClaudeCode, false);
  const { startWithClaudeCode } = await import(
    "../../plugin/desktop/launcher.mjs"
  );
  assert.equal(await startWithClaudeCode(dir), false);
});

test("unknown settings and wrong types are refused without a throw", async () => {
  const { ask } = await setup();
  for (const request of [
    { key: "launchAtLogin", value: true },
    { key: "startWithClaudeCode", value: "yes" },
    { key: "hotkey", value: 7 },
    null,
    "hotkey",
  ]) {
    const result = await ask("blinkling:settings-set", request);
    assert.equal(result.ok, false, JSON.stringify(request));
  }
});

test("only the settings window is trusted", async () => {
  const { ask, fire, log } = await setup();
  const stranger = {};
  assert.equal(
    await ask("blinkling:settings-ready", undefined, stranger),
    null,
  );
  assert.equal(
    (
      await ask(
        "blinkling:settings-set",
        { key: "hotkey", value: "Alt+K" },
        stranger,
      )
    ).ok,
    false,
  );
  fire("blinkling:settings-help", "welcome", stranger);
  assert.equal(log.welcome, 0);
  assert.deepEqual(log.hotkeys, []);
});

test("Help opens the welcome tour or the companion guide", async () => {
  const { controller, fire, log } = await setup();
  await controller.open();
  fire("blinkling:settings-help", "guide");
  assert.equal(log.guide, 1);
  fire("blinkling:settings-help", "welcome");
  assert.equal(log.welcome, 1);
  fire("blinkling:settings-help", "anything-else");
  assert.equal(log.guide + log.welcome, 2);
});

test("closing hands the keyboard back and hides after the reverse transition; reopening is cheap", async () => {
  const { controller, fire, state, timers, log, sent } = await setup();
  await controller.open();
  fire("blinkling:settings-close");
  assert.equal(log.restored, 1);
  assert.equal(controller.isOpen, false);
  assert.ok(sent.some(([c]) => c === "blinkling:settings-close"));
  assert.equal(state.visible, true, "still visible for the reverse transition");
  timers.at(-1).fn();
  assert.equal(state.visible, false);
  await controller.open();
  assert.equal(state.visible, true);
  assert.equal(state.hides, 1);
});

test("opening while open does not stack a second window", async () => {
  const { controller, log } = await setup();
  await controller.open();
  await controller.open();
  assert.equal(log.remembered, 1);
});

test("opening before the page has loaded waits for it, so the page sees the open message", async () => {
  let loaded;
  const page = new Promise((resolve) => (loaded = resolve));
  const { controller, sent, state } = await setup({ loaded: page });
  const opening = controller.open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.visible, false);
  assert.deepEqual(sent, []);
  loaded();
  await opening;
  assert.deepEqual(
    sent.map(([channel]) => channel),
    ["blinkling:settings-state", "blinkling:settings-open"],
  );
  assert.equal(state.visible, true);
});

test("closing while the page is still loading leaves the window hidden", async () => {
  let loaded;
  const page = new Promise((resolve) => (loaded = resolve));
  const { controller, sent, state } = await setup({ loaded: page });
  const opening = controller.open();
  controller.close();
  loaded();
  await opening;
  assert.equal(state.visible, false);
  assert.deepEqual(
    sent.map(([channel]) => channel),
    ["blinkling:settings-close"],
  );
});

test("a reopen while loading is announced once", async () => {
  let loaded;
  const page = new Promise((resolve) => (loaded = resolve));
  const { controller, sent } = await setup({ loaded: page });
  const first = controller.open();
  controller.close();
  const second = controller.open();
  loaded();
  await Promise.all([first, second]);
  assert.equal(
    sent.filter(([channel]) => channel === "blinkling:settings-open").length,
    1,
  );
});
