import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOTKEY,
  CLASHES,
  normalizeHotkey,
  validateHotkey,
  HotkeyRegistry,
  HotkeyStore,
} from "./hotkey.mjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const platforms = ["darwin", "win32", "linux"];

test("the default hotkey is valid on every platform", () => {
  for (const platform of platforms)
    assert.deepEqual(
      validateHotkey(DEFAULT_HOTKEY[platform], platform),
      { ok: true },
      platform,
    );
});

test("the default hotkey is not in the clash table on any platform", () => {
  for (const platform of platforms) {
    const clashes = new Set(
      CLASHES[platform].map((key) => normalizeHotkey(key, platform)),
    );
    assert.ok(
      !clashes.has(normalizeHotkey(DEFAULT_HOTKEY[platform], platform)),
      platform,
    );
  }
});

test("Save As, the screenshot keys and the other common system shortcuts clash", () => {
  const listed = {
    linux: [
      "Ctrl+Shift+S",
      "PrintScreen",
      "Shift+PrintScreen",
      "Alt+PrintScreen",
      "Ctrl+Alt+T",
      "Ctrl+Shift+Esc",
      "Ctrl+Shift+T",
      "Ctrl+Shift+N",
      "Ctrl+Shift+P",
      "Ctrl+Shift+I",
      "Ctrl+Alt+Delete",
      "Alt+F4",
      "Alt+Tab",
      "Super+L",
      "Super+D",
    ],
    win32: [
      "Ctrl+Shift+S",
      "PrintScreen",
      "Super+Shift+S",
      "Ctrl+Shift+Esc",
      "Ctrl+Alt+Delete",
      "Alt+F4",
      "Alt+Tab",
      "Ctrl+Shift+T",
      "Ctrl+Shift+N",
      "Ctrl+Shift+P",
      "Ctrl+Shift+I",
      "Super+L",
      "Super+D",
      "Super+Shift+Left",
    ],
    darwin: [
      "Cmd+Shift+S",
      "Cmd+Shift+3",
      "Cmd+Shift+4",
      "Cmd+Shift+5",
      "Cmd+Shift+T",
      "Cmd+Shift+N",
      "Cmd+Shift+P",
      "Cmd+Shift+I",
      "Cmd+Space",
      "Cmd+Tab",
      "Cmd+Q",
      "Cmd+W",
      "Cmd+Alt+Esc",
      "Ctrl+Cmd+Q",
      "Ctrl+Cmd+Space",
    ],
  };
  for (const [platform, keys] of Object.entries(listed))
    for (const key of keys)
      assert.deepEqual(
        validateHotkey(key, platform),
        { ok: false, reason: "clash" },
        `${platform} ${key}`,
      );
});

test("modifier spellings and order do not hide a clash", () => {
  for (const key of [
    "CommandOrControl+Shift+S",
    "Control+Shift+S",
    "shift+ctrl+s",
    "Shift+Control+S",
  ])
    assert.equal(validateHotkey(key, "linux").reason, "clash", key);
  assert.equal(validateHotkey("Command+Shift+3", "darwin").reason, "clash");
  assert.equal(validateHotkey("Meta+Space", "darwin").reason, "clash");
  assert.equal(validateHotkey("Super+Shift+S", "win32").reason, "clash");
});

test("a key that cannot be registered is invalid", () => {
  for (const key of [
    "",
    "   ",
    undefined,
    null,
    42,
    "S",
    "Shift+S",
    "Ctrl+",
    "Ctrl+Shift",
    "Ctrl+Alt+Nonsense",
    "Ctrl++S",
    "Ctrl+S+D",
    "Hyper+S",
  ])
    assert.deepEqual(
      validateHotkey(key, "linux"),
      { ok: false, reason: "invalid" },
      String(key),
    );
});

test("a bare function key is allowed, bare letters and Shift-only keys are not", () => {
  assert.deepEqual(validateHotkey("F9", "linux"), { ok: true });
  assert.equal(validateHotkey("A", "linux").reason, "invalid");
  assert.equal(validateHotkey("Shift+A", "linux").reason, "invalid");
});

test("ordinary Ctrl and Alt combinations are accepted", () => {
  assert.deepEqual(validateHotkey("Ctrl+Alt+B", "linux"), { ok: true });
  assert.deepEqual(validateHotkey("Alt+Shift+X", "win32"), { ok: true });
  assert.deepEqual(validateHotkey("Cmd+Alt+Shift+B", "darwin"), { ok: true });
});

function fakeShortcuts(refuse = []) {
  const registered = new Map();
  return {
    registered,
    register(accelerator, callback) {
      if (refuse.includes(accelerator)) return false;
      registered.set(accelerator, callback);
      return true;
    },
    unregister(accelerator) {
      registered.delete(accelerator);
    },
  };
}

test("setHotkey moves the registration to the new key", () => {
  const shortcuts = fakeShortcuts();
  let fired = 0;
  const registry = new HotkeyRegistry({
    shortcuts,
    platform: "linux",
    initial: "Alt+Shift+X",
    run: () => fired++,
  });
  assert.deepEqual(registry.start(), { ok: true });
  assert.deepEqual([...shortcuts.registered.keys()], ["Alt+Shift+X"]);
  assert.deepEqual(registry.set("Ctrl+Alt+B"), { ok: true });
  assert.deepEqual([...shortcuts.registered.keys()], ["Ctrl+Alt+B"]);
  shortcuts.registered.get("Ctrl+Alt+B")();
  assert.equal(fired, 1);
  assert.equal(registry.current, "Ctrl+Alt+B");
});

test("setHotkey rejects clashes and invalid keys without touching the old key", () => {
  const shortcuts = fakeShortcuts();
  const registry = new HotkeyRegistry({
    shortcuts,
    platform: "linux",
    initial: "Alt+Shift+X",
    run() {},
  });
  registry.start();
  assert.deepEqual(registry.set("Ctrl+Shift+S"), {
    ok: false,
    reason: "clash",
  });
  assert.deepEqual(registry.set("nonsense"), { ok: false, reason: "invalid" });
  assert.deepEqual([...shortcuts.registered.keys()], ["Alt+Shift+X"]);
  assert.equal(registry.current, "Alt+Shift+X");
});

test("setHotkey keeps the old key when the system refuses the new one", () => {
  const shortcuts = fakeShortcuts(["Ctrl+Alt+B"]);
  const registry = new HotkeyRegistry({
    shortcuts,
    platform: "linux",
    initial: "Alt+Shift+X",
    run() {},
  });
  registry.start();
  assert.deepEqual(registry.set("Ctrl+Alt+B"), {
    ok: false,
    reason: "unavailable",
  });
  assert.deepEqual([...shortcuts.registered.keys()], ["Alt+Shift+X"]);
  assert.equal(registry.current, "Alt+Shift+X");
});

test("a registration that throws counts as unavailable and keeps the old key", () => {
  const shortcuts = fakeShortcuts();
  const original = shortcuts.register;
  shortcuts.register = (accelerator, callback) => {
    if (accelerator === "Ctrl+Alt+B") throw new Error("bad accelerator");
    return original(accelerator, callback);
  };
  const registry = new HotkeyRegistry({
    shortcuts,
    platform: "linux",
    initial: "Alt+Shift+X",
    run() {},
  });
  registry.start();
  assert.equal(registry.set("Ctrl+Alt+B").reason, "unavailable");
  assert.equal(registry.current, "Alt+Shift+X");
});

test("start reports unavailable when the initial key is taken, and set can recover", () => {
  const shortcuts = fakeShortcuts(["Alt+Shift+X"]);
  const registry = new HotkeyRegistry({
    shortcuts,
    platform: "linux",
    initial: "Alt+Shift+X",
    run() {},
  });
  assert.deepEqual(registry.start(), { ok: false, reason: "unavailable" });
  assert.equal(registry.current, null);
  assert.deepEqual(registry.set("Ctrl+Alt+B"), { ok: true });
  assert.equal(registry.current, "Ctrl+Alt+B");
});

test("an invalid or clashing stored key falls back to the default", () => {
  const shortcuts = fakeShortcuts();
  const registry = new HotkeyRegistry({
    shortcuts,
    platform: "linux",
    initial: "Ctrl+Shift+S",
    run() {},
  });
  assert.deepEqual(registry.start(), { ok: true });
  assert.equal(registry.current, DEFAULT_HOTKEY.linux);
});

test("dispose unregisters the current key once", () => {
  const shortcuts = fakeShortcuts();
  const registry = new HotkeyRegistry({
    shortcuts,
    platform: "linux",
    initial: "Alt+Shift+X",
    run() {},
  });
  registry.start();
  registry.dispose();
  registry.dispose();
  assert.equal(shortcuts.registered.size, 0);
});

test("the chosen key survives a restart, and a missing or damaged file means the default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hotkey-"));
  try {
    const path = join(dir, "hotkey.json");
    const store = new HotkeyStore(path);
    assert.equal(await store.read(), undefined);
    await store.write("Alt+Shift+K");
    assert.equal(await new HotkeyStore(path).read(), "Alt+Shift+K");
    await writeFile(path, "{not json");
    assert.equal(await store.read(), undefined);
    await writeFile(path, JSON.stringify({ accelerator: 7 }));
    assert.equal(await store.read(), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
