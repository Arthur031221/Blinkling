import { test } from "node:test";
import assert from "node:assert/strict";
import { installPrivacy } from "./index.mjs";
import { say } from "./strings.mjs";

const secure = { secure: true, window: null };
const chrome = (over = {}) => ({
  secure: false,
  window: {
    id: "1",
    title: "Docs",
    app: "chrome",
    bounds: {},
    private: false,
    passwordManager: false,
    ...over,
  },
});
function rig(over = {}) {
  const sent = [];
  const listeners = new Set();
  const hooks = [];
  const calls = { screen: 0, pick: 0, pause: [] };
  const focus = { value: chrome() };
  const session = {
    subscribe: (f) => (listeners.add(f), () => listeners.delete(f)),
    beforeSend: (h) => (hooks.push(h), () => hooks.splice(hooks.indexOf(h), 1)),
  };
  const features = {
    capture: {
      screen: async () => (calls.screen++, { image: { data: "pixels" } }),
      pick: async () => (calls.pick++, { image: { data: "pixels" } }),
    },
    auto: { enabled: true, pause: (until) => calls.pause.push(until) },
  };
  const privacy = installPrivacy({
    session,
    features,
    locator: { focus: () => focus.value },
    send: (e) => sent.push(e),
    languages: ["en-US"],
    now: () => 1_000,
    ...over,
  });
  const emit = (e) => listeners.forEach((f) => f(e));
  const admit = async (turn) => {
    for (const h of hooks) {
      const v = await h(turn);
      if (v === false || v?.ok === false) return v;
    }
    return { ok: true };
  };
  return { privacy, sent, calls, focus, session, features, emit, admit, hooks };
}
const turn = (over = {}) => ({
  id: "t",
  text: "hi",
  attachments: [{ id: "a", name: "a.png", mediaType: "image/png", data: "x" }],
  source: "composer",
  ...over,
});

test("PV-1: a secure field blocks capture and sending and Blink gets the lock", async () => {
  const r = rig();
  r.focus.value = secure;
  assert.equal(await r.features.capture.screen("1"), null);
  assert.equal(await r.features.capture.pick("1"), null);
  assert.equal(r.calls.screen + r.calls.pick, 0, "nothing was captured");
  const verdict = await r.admit(turn());
  assert.deepEqual(verdict, { ok: false, reason: "secure" });
  assert.deepEqual(
    r.sent.filter((e) => e.type === "guard"),
    [{ type: "guard", lock: true }],
  );
  r.privacy.dispose();
});
test("PV-1: the lock lifts when the field is left, and capture works again", async () => {
  const r = rig();
  r.focus.value = chrome({ private: true });
  await r.features.capture.screen("1");
  r.focus.value = chrome();
  const shot = await r.features.capture.screen("1");
  assert.ok(shot);
  assert.deepEqual(
    r.sent.filter((e) => e.type === "guard"),
    [
      { type: "guard", lock: true },
      { type: "guard", lock: false },
    ],
  );
  assert.equal((await r.admit(turn())).ok, true);
  r.privacy.dispose();
});
test("PV-1: turns that carry no screen content are not held back", async () => {
  const r = rig();
  r.focus.value = secure;
  assert.equal((await r.admit(turn({ attachments: [] }))).ok, true);
  assert.equal(
    (await r.admit(turn({ source: "auto-explain", attachments: [] }))).ok,
    false,
  );
  assert.equal((await r.admit(turn({ source: "guide" }))).ok, false);
  r.privacy.dispose();
});
test("PV-1: a blocked capture says why once, in the system language", async () => {
  const r = rig({ languages: ["de-DE"] });
  r.focus.value = chrome({ app: "1password", passwordManager: true });
  await r.features.capture.screen("1");
  await r.features.capture.screen("1");
  const says = r.sent.filter((e) => e.type === "blink-say");
  assert.equal(says.length, 1);
  assert.equal(says[0].text, say("de")("lockPasswordManager"));
  r.privacy.dispose();
});
test("PV-1: the guard is reachable by auto explain and reports the watching face", async () => {
  const r = rig();
  assert.equal(
    r.features.capture.privacy.allowed({ automatic: true }).ok,
    true,
  );
  r.features.capture.privacy.report({ enabled: true, state: "watching" });
  r.features.capture.privacy.report({
    enabled: true,
    state: "paused",
    until: 5,
  });
  r.features.capture.privacy.report({ enabled: false, state: "paused" });
  assert.deepEqual(
    r.sent.filter((e) => e.type === "watching"),
    [
      { type: "watching", on: true },
      { type: "watching", on: false },
    ],
  );
  r.privacy.dispose();
});
test("PV-3: the usage limit gives one localized bubble with the reset time and pauses auto explain", async () => {
  const r = rig({
    languages: ["en-US"],
    now: () => Date.parse("2026-10-15T08:00:00Z"),
  });
  const resetAt = Date.parse("2026-10-15T10:30:00Z");
  r.emit({ type: "usage-limit", resetAt });
  r.emit({ type: "usage-limit", resetAt });
  const says = r.sent.filter((e) => e.type === "blink-say");
  assert.equal(says.length, 1, "exactly one bubble");
  assert.match(says[0].text, /usage limit/i);
  assert.doesNotMatch(says[0].text, /\{time\}/);
  assert.deepEqual(r.calls.pause, [resetAt]);
  assert.equal(
    r.sent.some((e) => e.type === "capture-status"),
    false,
  );
  r.privacy.dispose();
});
test("PV-3: a limit with no reset time still gets one calm bubble", async () => {
  const r = rig();
  r.emit({ type: "usage-limit", resetAt: null });
  const says = r.sent.filter((e) => e.type === "blink-say");
  assert.equal(says.length, 1);
  assert.equal(says[0].text, say("en")("usageLimitUnknown"));
  r.privacy.dispose();
});
test("PV-3: a new limit after the reset gets its own bubble", async () => {
  const r = rig();
  r.emit({ type: "usage-limit", resetAt: 5_000 });
  r.emit({ type: "usage-limit", resetAt: 90_000_000 });
  assert.equal(r.sent.filter((e) => e.type === "blink-say").length, 2);
  r.privacy.dispose();
});
test("PV-5: a missing Claude is one blink-say bubble with an install hint, never an error", async () => {
  const r = rig();
  r.emit({ type: "claude-missing" });
  r.emit({ type: "claude-missing" });
  const says = r.sent.filter((e) => e.type === "blink-say");
  assert.equal(says.length, 1);
  assert.match(says[0].text, /Claude Code/);
  assert.equal(
    r.sent.some((e) => /error/.test(JSON.stringify(e))),
    false,
  );
  r.privacy.dispose();
});
test("a guard that cannot tell what has focus refuses automatic captures and still lets the user capture", async () => {
  const r = rig({
    locator: {
      focus: () => {
        throw new Error("no window");
      },
    },
  });
  assert.equal(
    r.features.capture.privacy.allowed({ automatic: true }).ok,
    false,
  );
  assert.ok(await r.features.capture.screen("1"));
  r.privacy.dispose();
});
test("dispose restores the capture service and removes the send hook", async () => {
  const r = rig();
  const wrapped = r.features.capture.screen;
  r.privacy.dispose();
  assert.equal(r.hooks.length, 0);
  assert.notEqual(r.features.capture.screen, wrapped);
  assert.equal(r.features.capture.privacy, undefined);
});
test("the test hook exposes the guard and a focus override only under blinklingTest", async () => {
  globalThis.blinklingTest = {};
  try {
    const r = rig();
    assert.equal(typeof globalThis.blinklingTest.privacy.focus, "function");
    globalThis.blinklingTest.privacy.focus(secure);
    assert.equal(r.privacy.guard.allowed().ok, false);
    globalThis.blinklingTest.privacy.focus(null);
    assert.equal(r.privacy.guard.allowed().ok, true);
    r.privacy.dispose();
    assert.equal(globalThis.blinklingTest.privacy, undefined);
  } finally {
    delete globalThis.blinklingTest;
  }
});
test("under E2E the hook keeps an earlier module's hook when both wait for the shell's object", async () => {
  const before = process.env.BLINKLING_E2E;
  process.env.BLINKLING_E2E = "1";
  const saved = Object.getOwnPropertyDescriptor(globalThis, "blinklingTest");
  try {
    delete globalThis.blinklingTest;
    let held;
    Object.defineProperty(globalThis, "blinklingTest", {
      configurable: true,
      get: () => held,
      set(value) {
        held = value;
        if (value && typeof value === "object") value.pick = "pick hook";
      },
    });
    const r = rig();
    globalThis.blinklingTest = { other: 1 };
    assert.equal(globalThis.blinklingTest.pick, "pick hook");
    assert.equal(typeof globalThis.blinklingTest.privacy.focus, "function");
    r.privacy.dispose();
    assert.equal(globalThis.blinklingTest.privacy, undefined);
    assert.equal(globalThis.blinklingTest.pick, "pick hook");
  } finally {
    delete globalThis.blinklingTest;
    if (saved) Object.defineProperty(globalThis, "blinklingTest", saved);
    if (before === undefined) delete process.env.BLINKLING_E2E;
    else process.env.BLINKLING_E2E = before;
  }
});
test("under E2E the hook joins a blinklingTest object assigned after the install", async () => {
  const before = process.env.BLINKLING_E2E;
  process.env.BLINKLING_E2E = "1";
  try {
    const r = rig();
    globalThis.blinklingTest = { other: 1 };
    assert.equal(typeof globalThis.blinklingTest.privacy.focus, "function");
    assert.equal(globalThis.blinklingTest.other, 1);
    r.privacy.dispose();
    assert.equal(globalThis.blinklingTest.privacy, undefined);
  } finally {
    delete globalThis.blinklingTest;
    if (before === undefined) delete process.env.BLINKLING_E2E;
    else process.env.BLINKLING_E2E = before;
  }
});
test("under E2E the hook keeps another module's hook on the same pending blinklingTest", async () => {
  const before = process.env.BLINKLING_E2E;
  process.env.BLINKLING_E2E = "1";
  let other;
  try {
    // The pick installs first and waits for the shell's object the same way.
    Object.defineProperty(globalThis, "blinklingTest", {
      configurable: true,
      get: () => other,
      set(value) {
        other = value;
        if (value && typeof value === "object") value.pick = "pick hook";
      },
    });
    rig();
    globalThis.blinklingTest = { shell: 1 };
    assert.equal(typeof globalThis.blinklingTest.privacy.focus, "function");
    assert.equal(globalThis.blinklingTest.pick, "pick hook");
    assert.equal(globalThis.blinklingTest.shell, 1);
  } finally {
    delete globalThis.blinklingTest;
    if (before === undefined) delete process.env.BLINKLING_E2E;
    else process.env.BLINKLING_E2E = before;
  }
});
test("a renderer that loads late hears what is still true: the lock, watching, a missing Claude and a standing limit", async () => {
  let load;
  const r = rig({
    renderer: (listener) => ((load = listener), () => (load = null)),
  });
  r.focus.value = secure;
  r.privacy.guard.allowed({ automatic: true });
  r.features.capture.privacy.report({ enabled: true, state: "watching" });
  r.emit({ type: "claude-missing" });
  r.emit({ type: "usage-limit", resetAt: 5_000_000 });
  r.sent.length = 0;
  load();
  assert.deepEqual(r.sent.map((e) => e.type).sort(), [
    "blink-say",
    "blink-say",
    "guard",
    "watching",
  ]);
  assert.deepEqual(
    r.sent.find((e) => e.type === "guard"),
    { type: "guard", lock: true },
  );
  const ids = r.sent.filter((e) => e.type === "blink-say").map((e) => e.id);
  assert.ok(ids.includes("claude-missing"));
  r.emit({ type: "status", state: "connected" });
  r.focus.value = chrome();
  r.privacy.guard.allowed();
  r.sent.length = 0;
  load();
  assert.deepEqual(
    r.sent.map((e) => e.type),
    ["watching", "blink-say"],
  );
  r.privacy.dispose();
  assert.equal(load, null, "the renderer listener is released");
});
test("dispose survives a renderer that is already gone", () => {
  const r = rig({
    renderer: () => () => {
      throw new Error("Object has been destroyed");
    },
  });
  assert.doesNotThrow(() => r.privacy.dispose());
});

test("MV-1: openGuard refuses a password field, a password manager and a private window, tells Blink, and reads nothing", async () => {
  const r = rig();
  const windows = {
    pm: chrome({ app: "1password", passwordManager: true }),
    pv: chrome({ private: true }),
  };
  assert.equal(typeof r.privacy.openGuard.allowed, "function");
  assert.deepEqual(
    await r.privacy.openGuard.allowed({ point: { x: 1, y: 1 } }),
    { ok: true },
  );
  r.focus.value = secure;
  assert.deepEqual(
    await r.privacy.openGuard.allowed({ point: { x: 1, y: 1 } }),
    { ok: false, reason: "secure" },
  );
  assert.deepEqual(
    r.sent.find((e) => e.type === "guard"),
    { type: "guard", lock: true },
  );
  assert.equal(r.sent.filter((e) => e.type === "blink-say").length, 1);
  r.focus.value = windows.pm;
  assert.equal(
    (await r.privacy.openGuard.allowed({ point: { x: 1, y: 1 } })).reason,
    "password-manager",
  );
  r.focus.value = windows.pv;
  assert.equal(
    (await r.privacy.openGuard.allowed({ window: windows.pv.window })).reason,
    "private",
  );
  assert.equal(r.calls.screen + r.calls.pick, 0);
  assert.equal(r.hooks.length, 1);
  r.focus.value = chrome();
  assert.deepEqual(await r.privacy.openGuard.allowed({}), { ok: true });
  assert.deepEqual(r.sent.at(-1), { type: "guard", lock: false });
});

test("MV-1: openGuard looks at the window under the point through the locator", async () => {
  const pv = chrome({ private: true }).window;
  const r = rig({
    locator: {
      focus: () => chrome(),
      windowAt: async (p) => (p.x === 5 ? pv : null),
    },
  });
  assert.equal(
    (await r.privacy.openGuard.allowed({ point: { x: 5, y: 5 } })).reason,
    "private",
  );
  assert.equal(
    (await r.privacy.openGuard.allowed({ point: { x: 9, y: 9 } })).ok,
    true,
  );
});

test("MV-2: the privacy and pick test hooks coexist, whichever installs first, and each leaves cleanly", async () => {
  const { exposeTestHook } = await import("../shared/test-hooks.mjs");
  const before = process.env.BLINKLING_E2E;
  process.env.BLINKLING_E2E = "1";
  const saved = Object.getOwnPropertyDescriptor(globalThis, "blinklingTest");
  try {
    for (const order of [
      ["pick", "privacy"],
      ["privacy", "pick"],
    ]) {
      delete globalThis.blinklingTest;
      const apis = { pick: { id: "pick" }, privacy: { id: "privacy" } };
      const release = order.map((name) => exposeTestHook(name, apis[name]));
      globalThis.blinklingTest = { other: 1 };
      assert.equal(globalThis.blinklingTest.pick, apis.pick);
      assert.equal(globalThis.blinklingTest.privacy, apis.privacy);
      assert.equal(globalThis.blinklingTest.other, 1);
      release[0]();
      assert.equal(globalThis.blinklingTest[order[0]], undefined);
      assert.equal(globalThis.blinklingTest[order[1]], apis[order[1]]);
      release[1]();
    }
  } finally {
    delete globalThis.blinklingTest;
    if (saved) Object.defineProperty(globalThis, "blinklingTest", saved);
    if (before === undefined) delete process.env.BLINKLING_E2E;
    else process.env.BLINKLING_E2E = before;
  }
});

test("a session that cannot start is one bubble naming the fix, said again only for a new reason", async () => {
  const r = rig();
  r.emit({ type: "session-problem", code: "failed" });
  r.emit({ type: "session-problem", code: "failed" });
  r.emit({ type: "session-problem", code: "UNSUPPORTED_CLAUDE" });
  const says = r.sent.filter((e) => e.type === "blink-say");
  assert.equal(says.length, 3);
  assert.equal(says[0].id, says[1].id);
  assert.match(says[0].text, /blinkling\.log/);
  assert.match(says[2].text, /claude update/);
  r.privacy.dispose();
});
