import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPick } from "./install.mjs";
import { KEYCODES } from "./keys.mjs";
import { timing, duration } from "../shared/motion.mjs";

const PNG = "iVBORw0KGgo=";
const d1 = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1280, height: 800 },
  scaleFactor: 1,
};

function setup(options = {}) {
  const log = {
    windows: [],
    handlers: {},
    timers: [],
    turns: [],
    newChats: 0,
    attached: [],
    opened: 0,
    grabs: [],
    errors: [],
  };
  class Win {
    constructor(o) {
      this.options = o;
      this.calls = [];
      this.sent = [];
      this.destroyed = false;
      this.webContents = {
        once: () => {},
        send: (c, v) => this.sent.push([c, v]),
        setBackgroundThrottling: () => {},
      };
      log.windows.push(this);
    }
    loadFile(f) {
      this.file = f;
      return Promise.resolve();
    }
    setIgnoreMouseEvents() {}
    showInactive() {
      this.calls.push("show");
    }
    hide() {
      this.calls.push("hide");
    }
    setBounds() {}
    focus() {}
    isFocused() {
      return true;
    }
    isVisible() {
      return true;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const electron = {
    BrowserWindow: Win,
    screen: { getAllDisplays: () => [d1], on() {}, removeListener() {} },
    ipcMain: { on: (c, fn) => (log.handlers[c] = fn) },
    nativeImage: {},
  };
  let clock = 1_000_000;
  const hooks = [];
  const shell = {
    userDataDir:
      options.userDataDir ?? mkdtempSync(join(tmpdir(), "pick-install-")),
    env: { BLINKLING_LOCALE: "en", ...options.env },
    windowOptions: (bounds, focusable) => ({
      ...bounds,
      focusable,
      show: false,
      webPreferences: { preload: "app.cjs" },
    }),
    secure: () => {},
    windows: () => [],
    input: null,
    cursor: () => ({ x: 20, y: 20 }),
    blinkPoint: () => ({ x: 1280, y: 400 }),
    workArea: () => d1.bounds,
    session: { send: async (turn) => void log.turns.push(turn) },
    autoExplain: { get: () => false, set: async () => {} },
    composer: {
      open: async () => void log.opened++,
      attach: async (a) => void log.attached.push(a),
    },
    captureScreen: async (display) => (
      log.grabs.push(display),
      {
        image: { data: PNG },
        pixelWidth: 1280,
        pixelHeight: 800,
        region: d1.bounds,
      }
    ),
    newChat: async () => void log.newChats++,
  };
  const load =
    options.load ??
    (async () => ({
      uIOhook: {
        on: (type, fn) => hooks.push([type, fn]),
        removeAllListeners() {},
        start() {},
        stop() {},
      },
    }));
  const timers = [];
  return {
    log,
    shell,
    electron,
    hooks,
    timers,
    load,
    tick: (ms) => (clock += ms),
    install: () =>
      installPick({
        electron,
        shell,
        loadKeys: load,
        now: () => clock,
        // The layer's safety timeout stands in for the page's "flight done".
        setTimer: (fn, ms) => {
          timers.push({ fn, ms });
          if (ms === duration.slow * 4) setImmediate(fn);
          return timers.length;
        },
        clearTimer: () => {},
        onError: (e) => log.errors.push(e),
      }),
  };
}

test("at start one hidden layer per display and the hidden mini window exist, and the pick key source is listening", async () => {
  const s = setup();
  const pick = await s.install();
  assert.equal(s.log.windows.length, 2);
  for (const w of s.log.windows) assert.equal(w.options.show, false);
  assert.equal(s.log.windows[1].file.endsWith("mini/index.html"), true);
  assert.equal(pick.started, true);
  assert.deepEqual(s.hooks.map(([t]) => t).sort(), [
    "keydown",
    "keyup",
    "mousedown",
    "wheel",
  ]);
});

test("the layer windows load their own preload, the mini window its own, neither the shell's", async () => {
  const s = setup();
  await s.install();
  const [layer, mini] = s.log.windows;
  assert.equal(
    layer.options.webPreferences.preload.endsWith("pick/layer-preload.cjs"),
    true,
  );
  assert.equal(
    mini.options.webPreferences.preload.endsWith("mini/preload.cjs"),
    true,
  );
});

test("a native input module that cannot start loses the pick key, not the app", async () => {
  const s = setup({
    load: async () => {
      throw new Error("no input access");
    },
  });
  const pick = await s.install();
  assert.equal(pick.started, false);
  assert.equal(s.log.errors.length, 1);
  await pick.deliver({
    display: d1,
    region: d1.bounds,
    image: { id: "a", name: "x.png", mediaType: "image/png", data: PNG },
  });
});

const hintsSent = (win) =>
  win.sent
    .filter(([c, v]) => c === "blinkling:pick-message" && v.channel === "hint")
    .map(([, v]) => v.value.text);

async function hold(s, pick) {
  pick.test.keys.handle({ type: "keydown", code: KEYCODES.ctrl });
  s.timers.find((t) => t.ms === timing.pickHold).fn();
  await new Promise((r) => setImmediate(r));
  s.log.handlers["blinkling:pick-ready"]({
    sender: s.log.windows[0].webContents,
  });
}

test("the first hold of the pick key says to click once, and it never shows again, not even after a restart", async () => {
  const s = setup();
  const first = await s.install();
  await hold(s, first);
  assert.ok(s.log.windows[0].calls.includes("show"));
  assert.deepEqual(hintsSent(s.log.windows[0]), [
    "Click once to ask about this",
  ]);
  first.test.keys.handle({ type: "keyup", code: KEYCODES.ctrl });
  await new Promise((r) => setImmediate(r));
  s.timers.length = 0;
  await hold(s, first);
  assert.equal(
    hintsSent(s.log.windows[0]).length,
    1,
    "the second raise adds no hint",
  );
  first.dispose();

  const again = setup({ userDataDir: s.shell.userDataDir });
  const second = await again.install();
  await hold(again, second);
  assert.deepEqual(hintsSent(again.log.windows[0]), []);
  second.dispose();
});

test("a capture from the overlay or the hotkey goes through deliver, flies and opens the mini composer", async () => {
  const s = setup();
  const pick = await s.install();
  await pick.deliver({
    display: d1,
    region: { x: 10, y: 10, width: 100, height: 80 },
    image: {
      id: "a",
      name: "Selection.png",
      mediaType: "image/png",
      data: PNG,
    },
  });
  assert.equal(pick.test.mini.isOpen, true);
  assert.equal(s.log.newChats, 1);
  pick.test.mini.escape();
});

test("captures within 60 s share a chat; one 65 s later starts a new one", async () => {
  const s = setup();
  const pick = await s.install();
  const capture = {
    display: d1,
    region: { x: 10, y: 10, width: 100, height: 80 },
    image: {
      id: "a",
      name: "Selection.png",
      mediaType: "image/png",
      data: PNG,
    },
  };
  await pick.deliver(capture);
  s.tick(30_000);
  await pick.deliver(capture);
  assert.equal(s.log.newChats, 1);
  s.tick(65_000);
  await pick.deliver(capture);
  assert.equal(s.log.newChats, 2);
});

test("the pick key setting is validated, saved and survives a restart", async () => {
  const s = setup();
  const pick = await s.install();
  assert.equal(pick.setPickKey("shift"), false);
  assert.equal(pick.pickKey(), "control");
  assert.equal(pick.setPickKey("option"), true);
  pick.dispose();
  const again = setup({ userDataDir: s.shell.userDataDir });
  assert.equal((await again.install()).pickKey(), "option");
});

test("the test hook hangs on blinklingTest even though the shell assigns that object afterwards", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "blinklingTest");
  try {
    delete globalThis.blinklingTest;
    const s = setup({ env: { BLINKLING_E2E: "1" } });
    const pick = await s.install();
    globalThis.blinklingTest = { other: 1 };
    assert.equal(globalThis.blinklingTest.pick, pick);
    assert.equal(globalThis.blinklingTest.other, 1);
  } finally {
    delete globalThis.blinklingTest;
    if (saved) Object.defineProperty(globalThis, "blinklingTest", saved);
  }
});

test("translating a page from the mini composer sends the page text as a quick ask", async () => {
  const s = setup();
  const pick = await s.install();
  const text = "Bonjour tout le monde, voici une page entière.";
  const attachment = {
    id: "p",
    name: "Page.txt",
    mediaType: "text/plain",
    data: Buffer.from(text).toString("base64"),
  };
  await pick.openMini([
    {
      id: "p",
      kind: "page",
      attachment,
      taken: { kind: "page", browser: true, text },
    },
  ]);
  const win = s.log.windows[1];
  assert.ok(win.sent.some(([c]) => c === "blinkling:mini-view"));
  await s.log.handlers["blinkling:mini-offer"](
    { sender: win.webContents },
    "translate-page",
  );
  assert.equal(s.log.turns.length, 1);
  assert.equal(s.log.turns[0].source, "quick-ask");
  assert.deepEqual(s.log.turns[0].attachments, [attachment]);
});

test("a locator and guard plugged in later are used by the next pick", async () => {
  const s = setup();
  const pick = await s.install();
  const asked = [];
  pick.setLocator(
    {
      ...(await import("./install.mjs")).windowLocator,
      windowAt: async (point) => (asked.push(point), null),
    },
    { allowed: () => true },
  );
  pick.test.keys.handle({ type: "keydown", code: KEYCODES.ctrl });
  s.timers.find((t) => t.ms === timing.pickHold).fn();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(
    asked,
    [{ x: 20, y: 20 }],
    "the hover under the cursor asks the new locator",
  );
});

test("MV-1: the privacy guard given to setGuard locks the next pick, and the locator it looks through is the pick's", async () => {
  const s = setup();
  const pick = await s.install();
  const asked = [];
  pick.setGuard({
    allowed: async (o) => (asked.push(o), { ok: false, reason: "secure" }),
  });
  pick.test.keys.handle({ type: "keydown", code: KEYCODES.ctrl });
  s.timers.find((t) => t.ms === timing.pickHold).fn();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(asked[0].point, { x: 20, y: 20 });
  const next = { ...(await import("./install.mjs")).windowLocator };
  pick.setLocator(next);
  assert.equal(pick.locator(), next);
});

test("MV-2: pick and privacy test hooks both hang on blinklingTest, in either install order", async () => {
  const { installPrivacy } = await import("../privacy/index.mjs");
  const saved = Object.getOwnPropertyDescriptor(globalThis, "blinklingTest");
  const privacyOn = () =>
    installPrivacy({
      session: { subscribe: () => () => {}, beforeSend: () => () => {} },
      features: {},
      send: () => {},
    });
  const before = process.env.BLINKLING_E2E;
  process.env.BLINKLING_E2E = "1";
  try {
    for (const privacyFirst of [false, true]) {
      delete globalThis.blinklingTest;
      const s = setup({ env: { BLINKLING_E2E: "1" } });
      let privacy, pick;
      if (privacyFirst) privacy = privacyOn();
      pick = await s.install();
      if (!privacyFirst) privacy = privacyOn();
      globalThis.blinklingTest = { other: 1 };
      const hooks = globalThis.blinklingTest;
      assert.equal(hooks.pick, pick);
      assert.equal(typeof hooks.privacy.focus, "function");
      assert.equal(hooks.privacy.guard, privacy.guard);
      assert.equal(hooks.other, 1);
      privacy.dispose();
      assert.equal(hooks.privacy, undefined);
      assert.equal(hooks.pick, pick, "disposing privacy leaves the pick hook");
    }
  } finally {
    delete globalThis.blinklingTest;
    if (saved) Object.defineProperty(globalThis, "blinklingTest", saved);
    if (before === undefined) delete process.env.BLINKLING_E2E;
    else process.env.BLINKLING_E2E = before;
  }
});
