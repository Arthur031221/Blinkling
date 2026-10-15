import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { embeddedManifest, resolveBundled } from "./bundled.mjs";
import { TARGETS, assetName } from "./targets.mjs";

const here = new URL(".", import.meta.url).pathname;
const checker = join(here, "../../.github/workflows/bundle_manifest.py");

const pinned = (version = "3.0.0") => ({
  schemaVersion: 1,
  version,
  builds: TARGETS.map((target) => ({
    os: target.os,
    arch: target.arch,
    archive: target.archive,
    entry: target.entry ?? assetName(target, version),
    url: `https://github.com/Arthur031221/Blinkling/releases/download/v${version}/${assetName(target, version)}`,
    sha256: "a".repeat(64),
    size: 1234,
  })),
});

/** What esbuild writes for `import manifest from "./manifest.json"`. */
const bundleWith = (manifest) =>
  `var a = 1;\n// plugin/desktop/manifest.json\nvar manifest_default = ${JSON.stringify(manifest, null, 2).replace(/"([A-Za-z_$][\w$]*)":/g, "$1:")};\n\n// plugin/desktop/install.mjs\nvar b = 2;\n`;

test("a bundle with the pinned builds resolves every shipped target", () => {
  const manifest = pinned();
  const bundle = bundleWith(manifest);
  assert.deepEqual(embeddedManifest(bundle), manifest);
  const resolved = resolveBundled(bundle);
  const linux = resolved.find((b) => b.os === "linux" && b.arch === "x64");
  assert.match(linux.url, /Blinkling-3\.0\.0-linux-x64\.AppImage$/);
  assert.equal(resolved.length, 4);
});

test("a stale bundle with the empty manifest is rejected as unsupported", () => {
  const stale = bundleWith({ schemaVersion: 1, version: "3.0.0", builds: [] });
  assert.throws(() => resolveBundled(stale), /Unsupported desktop target: darwin\/arm64/);
});

test("a bundle without the embedded manifest is rejected", () => {
  assert.throws(() => embeddedManifest("var x = 1;\n"), /does not embed/);
});

test("the shipped bundle embeds exactly plugin/desktop/manifest.json", async () => {
  const bundle = await readFile(join(here, "../../bin/blinkling.cjs"), "utf8");
  const file = JSON.parse(await readFile(join(here, "../../plugin/desktop/manifest.json"), "utf8"));
  assert.deepEqual(embeddedManifest(bundle), file);
});

test("check-release rejects a bundle that embeds another manifest than the pinned file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bundled-"));
  try {
    const manifestPath = join(dir, "manifest.json");
    const bundlePath = join(dir, "blinkling.cjs");
    await writeFile(manifestPath, JSON.stringify(pinned()));
    await writeFile(bundlePath, bundleWith({ schemaVersion: 1, version: "3.0.0", builds: [] }));
    const stale = spawnSync("python3", [checker, bundlePath, manifestPath], { encoding: "utf8" });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale desktop manifest: 0 builds against 4 pinned/);
    await writeFile(bundlePath, bundleWith(pinned()));
    const fresh = execFileSync("python3", [checker, bundlePath, manifestPath], { encoding: "utf8" });
    assert.match(fresh, /embeds the pinned desktop manifest/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
