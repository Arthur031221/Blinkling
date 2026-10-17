import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { DEFAULT_QUIT_KEY, createQuitKey } from "./quit-key.mjs";
import { validateHotkey } from "../capture/hotkey.mjs";

function setup(options = {}) {
  const log = [];
  const registered = new Map();
  const shortcuts = {
    register: (key, run) => (registered.set(key, run), true),
    unregister: (key) => registered.delete(key),
  };
  let stored;
  const key = createQuitKey({
    shortcuts,
    platform: options.platform ?? "linux",
    store: {
      read: async () => stored,
      write: async (value) => void (stored = value),
    },
    quit: () => log.push("quit"),
    exit: () => log.push("exit"),
    announce: async () => void log.push("announce"),
    watchdog: (exit, ms) => log.push(`watchdog ${ms}`),
    backstop: (ms) => log.push(`backstop ${ms}`),
    ...options,
  });
  return { key, log, registered, stored: () => stored };
}

test("the default keys are the agreed chords and are valid on each system", () => {
  assert.equal(DEFAULT_QUIT_KEY.darwin, "Control+Alt+Command+B");
  assert.equal(DEFAULT_QUIT_KEY.win32, "Control+Alt+Shift+B");
  assert.equal(DEFAULT_QUIT_KEY.linux, "Control+Alt+Shift+B");
  for (const platform of Object.keys(DEFAULT_QUIT_KEY))
    assert.deepEqual(
      validateHotkey(DEFAULT_QUIT_KEY[platform], platform),
      { ok: true },
      platform,
    );
});

test("the default is registered at start, and the stored choice wins", async () => {
  const a = setup({ platform: "darwin" });
  await a.key.start();
  assert.deepEqual([...a.registered.keys()], ["Control+Alt+Command+B"]);
  const b = setup();
  assert.deepEqual(await b.key.set("Control+Alt+Shift+Q"), { ok: true });
  assert.equal(b.stored(), "Control+Alt+Shift+Q");
});

test("when the system refuses the key at start it is unset, not the word null, and another key can be picked", async () => {
  let open = false;
  const registered = new Map();
  const { key } = setup({
    shortcuts: {
      register: (k, run) => open && (registered.set(k, run), true),
      unregister: (k) => registered.delete(k),
    },
  });
  const started = await key.start();
  assert.deepEqual(started, { ok: false, reason: "unavailable" });
  assert.equal(key.current, null);
  assert.deepEqual(await key.set("Control+Alt+Shift+Q"), {
    ok: false,
    reason: "unavailable",
  });
  open = true;
  assert.deepEqual(await key.set("Control+Alt+Shift+Q"), { ok: true });
  assert.equal(key.current, "Control+Alt+Shift+Q");
  assert.ok(registered.has("Control+Alt+Shift+Q"));
});

test("pressing it tells the sessions, starts the quit and arms a one second hard exit", async () => {
  const t = setup();
  await t.key.start();
  t.registered.get("Control+Alt+Shift+B")();
  t.registered.get("Control+Alt+Shift+B")();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(t.log, [
    "watchdog 1000",
    "backstop 1500",
    "quit",
    "announce",
  ]);
});

test("a key the capture hotkey owns is refused", async () => {
  const t = setup({ reserved: () => ["Alt+Shift+X"] });
  await t.key.start();
  assert.deepEqual(await t.key.set("Alt+Shift+X"), {
    ok: false,
    reason: "clash",
  });
  assert.equal(t.key.current, "Control+Alt+Shift+B");
});

test("a quit that never finishes is ended after about a second, with the main thread stuck", async () => {
  // A child whose main thread spins forever stands for a hung renderer or a
  // stalled native call: only the worker's deadline can end it.
  const module = new URL("./quit.mjs", import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      "-e",
      `import(${JSON.stringify(module)}).then((m) => {
        m.armHardQuitDeadline(300);
        for (;;);
      })`,
    ],
    { stdio: "ignore" },
  );
  const started = Date.now();
  const [code, signal] = await new Promise((done) =>
    child.on("exit", (c, s) => done([c, s])),
  );
  // Windows has no signals: the process is ended outright and reports a code.
  if (process.platform === "win32") assert.notEqual(code, 0);
  else assert.equal(signal, "SIGKILL");
  assert.ok(Date.now() - started < 3000);
});
