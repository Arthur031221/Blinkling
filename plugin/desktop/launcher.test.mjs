import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { selectBuild, verifyArchive } from "./launcher.mjs";
import { readFile } from "node:fs/promises";
test("launcher refuses replaced archives and release origins", () => {
  const bytes = Buffer.from("archive");
  const b = {
    os: "linux",
    arch: "x64",
    url: "https://github.com/Arthur031221/Blinkling/releases/download/v3.0.0/Blinkling-3.0.0-linux-x64.AppImage",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  assert.equal(selectBuild({ builds: [b] }, "linux", "x64"), b);
  verifyArchive(bytes, b);
  assert.throws(() => verifyArchive(Buffer.from("tampered"), b), /checksum/);
  assert.throws(
    () =>
      selectBuild(
        { builds: [{ ...b, url: "https://example.com/app" }] },
        "linux",
        "x64",
      ),
    /origin/,
  );
  assert.throws(
    () => selectBuild({ builds: [b] }, "win32", "arm64"),
    /Unsupported/,
  );
});

const release = (path) => `https://github.com${path}`;
const accepted = (url) =>
  selectBuild({ builds: [{ ...build(), url }] }, "linux", "x64").url;
const build = () => ({
  os: "linux",
  arch: "x64",
  url: release("/Arthur031221/Blinkling/releases/download/v3.0.0/a.AppImage"),
  sha256: "a".repeat(64),
});

test("the launcher accepts the Blinkling and the old Glimpselet release paths only", () => {
  for (const repo of ["Blinkling", "Glimpselet"]) {
    const url = release(`/Arthur031221/${repo}/releases/download/v3.0.0/a.zip`);
    assert.equal(accepted(url), url);
  }
  for (const path of [
    "/Arthur031221/Blinklings/releases/download/v3.0.0/a.zip",
    "/Arthur031221/Blinkling-fork/releases/download/v3.0.0/a.zip",
    "/Someone/Blinkling/releases/download/v3.0.0/a.zip",
    "/Arthur031221/Blinkling/releases/latest/download/a.zip",
    "/Arthur031221/Blinkling/archive/refs/tags/v3.0.0.zip",
    "/Arthur031221/Blinkling/releases/download/../../../evil/x/releases/download/a.zip",
  ])
    assert.throws(() => accepted(release(path)), /origin/, path);
  for (const url of [
    "http://github.com/Arthur031221/Blinkling/releases/download/v3.0.0/a.zip",
    "https://github.com:444/Arthur031221/Blinkling/releases/download/v3.0.0/a.zip",
    "https://github.com.evil.example/Arthur031221/Blinkling/releases/download/v3.0.0/a.zip",
    "https://user@github.com/Arthur031221/Blinkling/releases/download/v3.0.0/a.zip",
    "https://github.com/Arthur031221/Blinkling/releases/download/v3.0.0/a.zip?x=1",
  ])
    assert.throws(() => accepted(url), /origin/, url);
});

test("the manifest names the operating system in the os field", () => {
  const entry = build();
  assert.equal(selectBuild({ builds: [entry] }, "linux", "x64"), entry);
  assert.throws(
    () =>
      selectBuild(
        { builds: [{ ...entry, os: undefined, platform: "linux" }] },
        "linux",
        "x64",
      ),
    /Unsupported/,
  );
  assert.throws(
    () => selectBuild({ builds: [entry, { ...entry }] }, "linux", "x64"),
    /Duplicate/,
  );
});

test("a manifest with no pinned builds says so instead of naming the platform", () => {
  assert.throws(
    () => selectBuild({ schemaVersion: 1, version: "3.0.0", builds: [] }),
    /no release build pinned/,
  );
});

test("the Mac app is copied with its framework links kept relative", async () => {
  const source = await readFile(
    new URL("./launcher.mjs", import.meta.url),
    "utf8",
  );
  const copy = source.slice(source.indexOf("await cp(source, stage"));
  assert.match(copy.slice(0, 200), /verbatimSymlinks: true/);
});

test("a Blink that stopped answering is ended and its endpoint cleared; anything else is left alone", async () => {
  const { replaceHungDesktop } = await import("./launcher.mjs");
  const { mkdtemp, writeFile, access } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const exists = (p) =>
    access(p).then(
      () => true,
      () => false,
    );
  const make = async (pid) => {
    const file = join(await mkdtemp(join(tmpdir(), "hung-")), "desktop.json");
    await writeFile(file, JSON.stringify({ pid, token: "t" }));
    return file;
  };
  const killed = [];
  const hung = {
    isAlive: () => true,
    isBlink: async () => true,
    kill: (pid) => killed.push(pid),
  };
  const file = await make(4242);
  assert.equal(await replaceHungDesktop(file, hung), true);
  assert.deepEqual(killed, [4242]);
  assert.equal(await exists(file), false);
  // A recycled id that is not Blink is never killed.
  const other = await make(4343);
  assert.equal(
    await replaceHungDesktop(other, { ...hung, isBlink: async () => false }),
    false,
  );
  assert.deepEqual(killed, [4242]);
  // A dead process, our own id and a missing file are all harmless.
  assert.equal(
    await replaceHungDesktop(await make(4545), {
      ...hung,
      isAlive: () => false,
    }),
    false,
  );
  assert.equal(await replaceHungDesktop(await make(process.pid), hung), false);
  assert.equal(
    await replaceHungDesktop("/nonexistent/desktop.json", hung),
    false,
  );
  assert.deepEqual(killed, [4242]);
});

test("a Blink of another version than the plugin's is replaced, the same version is reused", async () => {
  const { isOtherBuild } = await import("./launcher.mjs");
  const manifest = { version: "3.2.5" };
  assert.equal(isOtherBuild({ status: { version: "3.2.0" } }, manifest), true);
  assert.equal(isOtherBuild({ status: { version: "3.2.5" } }, manifest), false);
  assert.equal(isOtherBuild({ status: {} }, manifest), false);
  assert.equal(isOtherBuild(null, manifest), false);
});
