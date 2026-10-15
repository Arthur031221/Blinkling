import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TARGETS, assetName } from "./targets.mjs";
import { packagePlan } from "./package.mjs";

const target = (os, arch) =>
  TARGETS.find((t) => t.os === os && t.arch === arch);

test("linux and windows go through electron-builder with the release asset name", () => {
  for (const [os, arch, flag, format] of [
    ["linux", "x64", "--linux", "AppImage"],
    ["win32", "x64", "--win", "portable"],
  ]) {
    const plan = packagePlan({
      target: target(os, arch),
      version: "3.0.0",
      packaged: "/p/app",
      output: "/o",
    });
    assert.equal(plan.tool, "electron-builder");
    assert.ok(plan.args.includes(flag));
    assert.ok(plan.args.includes(format));
    assert.ok(plan.args.includes("--prepackaged"));
    assert.equal(
      plan.config.artifactName,
      assetName(target(os, arch), "3.0.0"),
    );
    assert.equal(plan.config.directories.output, "/o");
  }
});

test("the electron-builder pin is exact so a release cannot drift", () => {
  const plan = packagePlan({
    target: target("linux", "x64"),
    version: "3.0.0",
    packaged: "/p",
    output: "/o",
  });
  assert.match(plan.package, /^electron-builder@\d+\.\d+\.\d+$/);
});

test("mac is zipped with ditto so symlinks and the signature survive", () => {
  const plan = packagePlan({
    target: target("darwin", "arm64"),
    version: "3.0.0",
    packaged: "/p/Blinkling-darwin-arm64",
    output: "/o",
  });
  assert.equal(plan.tool, "ditto");
  assert.deepEqual(plan.args.slice(0, 3), ["-c", "-k", "--keepParent"]);
  assert.equal(plan.args.at(-1), join("/o", "Blinkling-3.0.0-mac-arm64.zip"));
  assert.equal(
    plan.args.at(-2),
    join("/p/Blinkling-darwin-arm64", "Blinkling.app"),
  );
});

test("the AppImage launches the binary the packager produced", () => {
  // AppRun execs <executableName>; the packager names the binary after the app.
  const plan = packagePlan({
    target: target("linux", "x64"),
    version: "3.0.0",
    packaged: "/p",
    output: "/o",
  });
  assert.equal(plan.config.linux.executableName, "Blinkling");
});

test("the AppImage carries Blink's icon and the metadata electron-builder warns about", async () => {
  const plan = packagePlan({
    target: target("linux", "x64"),
    version: "3.0.0",
    packaged: "/p",
    output: "/o",
  });
  const { linux, extraMetadata } = plan.config;
  const icon = await readFile(linux.icon);
  assert.equal(icon.subarray(1, 4).toString(), "PNG");
  // electron-builder wants at least 256px for a Linux icon; Blink ships at 512.
  assert.equal(icon.readUInt32BE(16), 512);
  assert.equal(icon.readUInt32BE(20), 512);
  assert.equal(extraMetadata.desktopName, "blinkling.desktop");
  // The .desktop file takes its name from desktopName so it matches the WM class.
  assert.equal(linux.syncDesktopName, true);
  assert.equal(extraMetadata.description, "Blink, the Blinkling companion");
  assert.deepEqual(extraMetadata.author, { name: "Arthur031221" });
  assert.equal(extraMetadata.version, "3.0.0");
});

test("the app's own package.json names the desktop entry Electron looks up", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.desktopName, "blinkling.desktop");
  assert.equal(pkg.description, "Blink, the Blinkling companion");
  assert.deepEqual(pkg.author, { name: "Arthur031221" });
});

test("the other platforms keep their plain config", () => {
  const plan = packagePlan({
    target: target("win32", "x64"),
    version: "3.0.0",
    packaged: "/p",
    output: "/o",
  });
  assert.equal(plan.config.linux, undefined);
});

test("electron-builder never tries to publish from a CI runner", async () => {
  const source = await readFile(
    new URL("./package.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /"--publish",\s*"never"/);
});

test("the mac app is signed ad hoc with codesign and verified, not through the keychain-only packager option", async () => {
  const source = await readFile(
    new URL("./build.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /osxSign/);
  assert.match(source, /"--force", "--deep", "--sign", "-"/);
  assert.match(source, /"--verify", "--deep", "--strict"/);
});
