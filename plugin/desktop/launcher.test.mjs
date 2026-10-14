import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { selectBuild, verifyArchive } from "./launcher.mjs";
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
