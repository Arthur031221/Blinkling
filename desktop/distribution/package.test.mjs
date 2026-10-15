import test from "node:test";
import assert from "node:assert/strict";
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
  // The plan joins with the host's separator, so the expectation does too.
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
