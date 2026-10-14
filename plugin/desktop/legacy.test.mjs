import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adoptLegacyEnv,
  legacyLocations,
  migrateLegacyData,
  migrationRecord,
} from "./legacy.mjs";

const OLD = "GLIMPSELET_";
async function home(t) {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-legacy-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const put = async (path, text = "x") => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
};
const linux = (h) => ({ home: h, platform: "linux", env: {} });

test("old environment switches are read when the new ones are unset", () => {
  const env = {
    [`${OLD}REMOTE`]: "0",
    [`${OLD}PORT`]: "4000",
    BLINKLING_PORT: "5000",
    UNRELATED: "1",
  };
  assert.equal(adoptLegacyEnv(env), env);
  assert.equal(env.BLINKLING_REMOTE, "0");
  assert.equal(env.BLINKLING_PORT, "5000", "a new name always wins");
  assert.equal(env.UNRELATED, "1");
  assert.equal(env.BLINKLING_UNRELATED, undefined);
});

test("an empty old switch is still a choice", () => {
  const env = { [`${OLD}BROWSER`]: "" };
  adoptLegacyEnv(env);
  assert.equal(env.BLINKLING_BROWSER, "");
});

test("settings, guides, extension folder, runtime and builds move once", async (t) => {
  const h = await home(t);
  await put(join(h, ".config", "Glimpselet", "blink-positions.json"), "pos");
  await put(
    join(h, ".config", "glimpselet", "floating-geometry-v1.json"),
    "geo",
  );
  await put(
    join(h, "Documents", "Glimpselet Guides", "a", "guide.json"),
    "guide",
  );
  await put(join(h, "Glimpselet-extension", "manifest.json"), "ext");
  await put(join(h, ".glimpselet", "runtime", "desktop.json"), "rt");
  await put(
    join(h, ".local", "share", "glimpselet", "desktop", "build", "app"),
    "bin",
  );
  const result = await migrateLegacyData(linux(h));
  assert.deepEqual(result.failed, []);
  assert.equal(result.moved.length, 6);
  const read = (...p) => readFile(join(h, ...p), "utf8");
  assert.equal(
    await read(".config", "Blinkling", "blink-positions.json"),
    "pos",
  );
  assert.equal(
    await read(".config", "blinkling", "floating-geometry-v1.json"),
    "geo",
  );
  assert.equal(
    await read("Documents", "Blinkling Guides", "a", "guide.json"),
    "guide",
  );
  assert.equal(await read("Blinkling-extension", "manifest.json"), "ext");
  assert.equal(await read(".blinkling", "runtime", "desktop.json"), "rt");
  assert.equal(
    await read(".local", "share", "blinkling", "desktop", "build", "app"),
    "bin",
  );
  for (const [from] of legacyLocations(linux(h)))
    assert.equal(existsSync(from), false, `${from} is gone`);
  assert.ok((await migrationRecord(h)).moved.length === 6);
});

test("it runs once: later old data is left alone", async (t) => {
  const h = await home(t);
  await put(join(h, ".config", "Glimpselet", "a.json"), "1");
  await migrateLegacyData(linux(h));
  await put(join(h, ".config", "Glimpselet", "b.json"), "2");
  const again = await migrateLegacyData(linux(h));
  assert.equal(again.skipped, "done");
  assert.equal(existsSync(join(h, ".config", "Glimpselet", "b.json")), true);
  assert.equal(existsSync(join(h, ".config", "Blinkling", "b.json")), false);
});

test("a fresh install is quiet and creates nothing but the marker", async (t) => {
  const h = await home(t);
  const result = await migrateLegacyData(linux(h));
  assert.deepEqual(result.moved, []);
  assert.deepEqual(result.failed, []);
  assert.equal(existsSync(join(h, ".config")), false);
  assert.equal(existsSync(join(h, "Documents")), false);
  assert.deepEqual((await migrationRecord(h)).moved, []);
});

test("what the new version already wrote is never overwritten", async (t) => {
  const h = await home(t);
  await put(join(h, ".config", "Glimpselet", "settings.json"), "old");
  await put(join(h, ".config", "Glimpselet", "extra.json"), "extra");
  await put(join(h, ".config", "Glimpselet", "sub", "kept.txt"), "kept");
  await put(join(h, ".config", "Blinkling", "settings.json"), "new");
  await put(join(h, ".config", "Blinkling", "sub", "own.txt"), "own");
  const result = await migrateLegacyData(linux(h));
  assert.deepEqual(result.failed, []);
  const read = (...p) =>
    readFile(join(h, ".config", "Blinkling", ...p), "utf8");
  assert.equal(await read("settings.json"), "new");
  assert.equal(await read("extra.json"), "extra");
  assert.equal(await read("sub", "kept.txt"), "kept");
  assert.equal(await read("sub", "own.txt"), "own");
  // The conflicting old file stays where it was, so nothing is lost.
  assert.equal(
    await readFile(join(h, ".config", "Glimpselet", "settings.json"), "utf8"),
    "old",
  );
});

test("an explicit runtime directory or a test run is not migrated", async (t) => {
  const h = await home(t);
  await put(join(h, ".config", "Glimpselet", "a.json"));
  for (const env of [
    { BLINKLING_RUNTIME_DIR: "/tmp/x" },
    { BLINKLING_E2E: "1" },
  ]) {
    const result = await migrateLegacyData({ home: h, platform: "linux", env });
    assert.equal(result.skipped, "explicit");
  }
  assert.equal(existsSync(join(h, ".config", "Glimpselet", "a.json")), true);
  assert.equal(existsSync(join(h, ".blinkling")), false);
});

test("symlinks move as links and are never followed", async (t) => {
  const h = await home(t);
  await put(join(h, "elsewhere", "secret.txt"), "s");
  await mkdir(join(h, ".config", "Glimpselet"), { recursive: true });
  await symlink(join(h, "elsewhere"), join(h, ".config", "Glimpselet", "link"));
  await migrateLegacyData(linux(h));
  assert.equal(
    existsSync(join(h, ".config", "Blinkling", "link", "secret.txt")),
    true,
  );
  assert.equal(await readFile(join(h, "elsewhere", "secret.txt"), "utf8"), "s");
});

test("per platform locations use the right bases", () => {
  const mac = legacyLocations({ home: "/h", platform: "darwin", env: {} });
  assert.ok(
    mac.some(
      ([from, to]) =>
        from === "/h/Library/Application Support/Glimpselet" &&
        to === "/h/Library/Application Support/Blinkling",
    ),
  );
  const win = legacyLocations({
    home: "C:/h",
    platform: "win32",
    env: { APPDATA: "C:/r", LOCALAPPDATA: "C:/l" },
  });
  assert.ok(win.some(([from]) => from === "C:/r/Glimpselet"));
  assert.ok(
    win.some(
      ([from, to]) => from === "C:/l/Glimpselet" && to === "C:/l/Blinkling",
    ),
  );
  const xdg = legacyLocations({
    home: "/h",
    platform: "linux",
    env: { XDG_CONFIG_HOME: "/c", XDG_DATA_HOME: "/d" },
  });
  assert.ok(
    xdg.some(([from, to]) => from === "/c/Glimpselet" && to === "/c/Blinkling"),
  );
  assert.ok(
    xdg.some(([from, to]) => from === "/d/glimpselet" && to === "/d/blinkling"),
  );
});
