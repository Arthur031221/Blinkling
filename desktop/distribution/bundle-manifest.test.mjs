import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { selectBuild } from "../../plugin/desktop/launcher.mjs";
import { TARGETS, assetName } from "./targets.mjs";
import {
  checkBundle,
  embeddedManifest,
  resolveTargets,
} from "./bundle-manifest.mjs";

const run = promisify(execFile);
const root = new URL("../..", import.meta.url).pathname;
const CLI = join(root, "desktop/distribution/bundle-manifest.mjs");

const pinned = (version = "3.0.0") => ({
  schemaVersion: 1,
  version,
  builds: TARGETS.map((target) => ({
    os: target.os,
    arch: target.arch,
    url: `https://github.com/Arthur031221/Blinkling/releases/download/v${version}/${assetName(target, version)}`,
    sha256: "a".repeat(64),
    size: 1234,
  })),
});

/** What esbuild writes for `import manifest from "./manifest.json"`. */
function bundleWith(manifest, name = "manifest_default") {
  const body = JSON.stringify(manifest, null, 2).replace(
    /"([A-Za-z_]\w*)":/g,
    "$1:",
  );
  return `var x = 1;\n\n// plugin/desktop/manifest.json\nvar ${name} = ${body};\n\n// plugin/desktop/install.mjs\nvar y = 2;\n`;
}

test("the manifest is read back out of a bundle exactly as pinned", () => {
  const manifest = pinned();
  assert.deepEqual(embeddedManifest(bundleWith(manifest)), manifest);
  assert.deepEqual(
    embeddedManifest(bundleWith(manifest, "manifest_default2")),
    manifest,
  );
});

test("a bundle without the manifest is rejected, not read as empty", () => {
  assert.throws(() => embeddedManifest("var a = 1;\n"), /no embedded/i);
});

test("a stale bundle that still embeds the empty manifest fails the check", () => {
  const stale = bundleWith({ schemaVersion: 1, version: "3.0.0", builds: [] });
  assert.throws(
    () => checkBundle(stale, pinned()),
    /differs from plugin\/desktop\/manifest\.json/,
  );
});

test("a bundle pinned to an older release fails the check", () => {
  assert.throws(
    () => checkBundle(bundleWith(pinned("2.9.0")), pinned()),
    /differs/,
  );
});

test("a bundle that embeds the pinned manifest passes", () => {
  assert.doesNotThrow(() => checkBundle(bundleWith(pinned()), pinned()));
});

test("the launcher resolves every shipped target from the bundled manifest", () => {
  const manifest = embeddedManifest(bundleWith(pinned()));
  const found = resolveTargets(manifest, [
    "linux/x64",
    "darwin/arm64",
    "darwin/x64",
    "win32/x64",
  ]);
  assert.deepEqual(
    found.map((b) => `${b.os}/${b.arch}`),
    ["linux/x64", "darwin/arm64", "darwin/x64", "win32/x64"],
  );
  assert.equal(found[0].url, selectBuild(manifest, "linux", "x64").url);
});

test("the empty manifest cannot resolve linux/x64: the released-plugin failure", () => {
  const empty = embeddedManifest(
    bundleWith({ schemaVersion: 1, version: "3.0.0", builds: [] }),
  );
  assert.throws(
    () => resolveTargets(empty, ["linux/x64"]),
    /Unsupported desktop target: linux\/x64/,
  );
});

test("the checked-in bundle embeds exactly the checked-in manifest", async () => {
  const bundle = await readFile(join(root, "bin/blinkling.cjs"), "utf8");
  const manifest = JSON.parse(
    await readFile(join(root, "plugin/desktop/manifest.json"), "utf8"),
  );
  assert.doesNotThrow(() => checkBundle(bundle, manifest));
});

test("the command line exits non-zero for a stale bundle and names the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-bundle-"));
  try {
    const manifestFile = join(dir, "manifest.json");
    const good = join(dir, "good.cjs");
    const stale = join(dir, "stale.cjs");
    await writeFile(manifestFile, JSON.stringify(pinned()));
    await writeFile(good, bundleWith(pinned()));
    await writeFile(
      stale,
      bundleWith({ schemaVersion: 1, version: "3.0.0", builds: [] }),
    );
    const ok = await run(process.execPath, [
      CLI,
      "--resolve",
      "linux/x64",
      good,
      manifestFile,
    ]);
    assert.match(ok.stdout, /linux\/x64/);
    await assert.rejects(
      run(process.execPath, [CLI, stale, manifestFile]),
      (error) => {
        assert.notEqual(error.code, 0);
        assert.match(error.stderr, /stale\.cjs/);
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
