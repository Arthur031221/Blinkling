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
  const calls = { screen: 0, region: 0, pause: [] };
  const focus = { value: chrome() };
  const session = {
    subscribe: (f) => (listeners.add(f), () => listeners.delete(f)),
    beforeSend: (h) => (hooks.push(h), () => hooks.splice(hooks.indexOf(h), 1)),
  };
  const features = {
    capture: {
      screen: async () => (calls.screen++, { image: { data: "pixels" } }),
      region: async () => (calls.region++, { image: { data: "pixels" } }),
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
  assert.equal(await r.features.capture.region("1"), null);
  assert.equal(r.calls.screen + r.calls.region, 0, "nothing was captured");
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
