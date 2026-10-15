import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore } from "./store.mjs";
import { startWithClaudeCode } from "../../plugin/desktop/launcher.mjs";

const home = () => mkdtemp(join(tmpdir(), "blinkling-settings-"));

test("start with Claude Code is on until the user turns it off", async () => {
  const dir = await home();
  const store = createSettingsStore(join(dir, "settings.json"));
  assert.deepEqual(store.get(), { startWithClaudeCode: true });
});

test("a change is written where the launcher reads it", async () => {
  const dir = await home();
  const store = createSettingsStore(join(dir, "settings.json"));
  assert.equal(await startWithClaudeCode(dir), true);
  store.set({ startWithClaudeCode: false });
  assert.equal(await startWithClaudeCode(dir), false);
  store.set({ startWithClaudeCode: true });
  assert.equal(await startWithClaudeCode(dir), true);
  const saved = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  assert.deepEqual(saved, { schemaVersion: 1, startWithClaudeCode: true });
});

test("the choice survives a restart", async () => {
  const dir = await home();
  const file = join(dir, "settings.json");
  createSettingsStore(file).set({ startWithClaudeCode: false });
  assert.equal(createSettingsStore(file).get().startWithClaudeCode, false);
});

test("the file is private and no temporary file is left behind", async () => {
  const dir = await home();
  const file = join(dir, "settings.json");
  createSettingsStore(file).set({ startWithClaudeCode: false });
  if (process.platform !== "win32")
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(dir), ["settings.json"]);
});

test("a damaged or foreign file never switches Blink off", async () => {
  const dir = await home();
  const file = join(dir, "settings.json");
  for (const text of ["", "{", "[]", '{"startWithClaudeCode":"no"}', "null"]) {
    await writeFile(file, text);
    assert.equal(createSettingsStore(file).get().startWithClaudeCode, true, text);
  }
});

test("only known settings with the right type are accepted", async () => {
  const dir = await home();
  const store = createSettingsStore(join(dir, "settings.json"));
  assert.throws(() => store.set({ startWithClaudeCode: "yes" }), /startWithClaudeCode/);
  assert.throws(() => store.set({ launchAtLogin: true }), /launchAtLogin/);
  assert.equal(store.get().startWithClaudeCode, true);
});

test("a write that fails keeps the setting in memory and reports it", async () => {
  const dir = await home();
  const errors = [];
  await writeFile(join(dir, "blocked"), "a file, not a directory");
  const store = createSettingsStore(join(dir, "blocked", "settings.json"), {
    onError: (e) => errors.push(e),
  });
  store.set({ startWithClaudeCode: false });
  assert.equal(store.get().startWithClaudeCode, false);
  assert.equal(errors.length, 1);
});
