import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectBuild } from "../../plugin/desktop/launcher.mjs";
import { TARGETS, assetName } from "./targets.mjs";
import { buildManifest, writeRelease } from "./manifest.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function assets(version, skip) {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-assets-"));
  const bytes = {};
  for (const target of TARGETS) {
    const name = assetName(target, version);
    bytes[name] = Buffer.from(`${name} contents`);
    if (name !== skip) await writeFile(join(dir, name), bytes[name]);
  }
  return { dir, bytes };
}

test("assets are named Blinkling-<version>-<os-arch> with the right extension", () => {
  assert.deepEqual(
    TARGETS.map((t) => assetName(t, "3.0.0")),
    [
      "Blinkling-3.0.0-mac-arm64.zip",
      "Blinkling-3.0.0-mac-x64.zip",
      "Blinkling-3.0.0-win-x64.exe",
      "Blinkling-3.0.0-linux-x64.AppImage",
    ],
  );
});

test("the manifest pins every asset by digest and size, and the launcher accepts each entry", async () => {
  const { dir, bytes } = await assets("3.0.0");
  try {
    const manifest = await buildManifest({ version: "3.0.0", directory: dir });
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.version, "3.0.0");
    assert.equal(manifest.builds.length, 4);
    for (const build of manifest.builds) {
      const name = build.url.split("/").pop();
      assert.equal(
        build.url,
        `https://github.com/Arthur031221/Blinkling/releases/download/v3.0.0/${name}`,
      );
      assert.equal(build.sha256, sha(bytes[name]));
      assert.equal(build.size, bytes[name].length);
      assert.equal(selectBuild(manifest, build.os, build.arch), build);
    }
    const byTarget = Object.fromEntries(
      manifest.builds.map((b) => [`${b.os}-${b.arch}`, b]),
    );
    assert.equal(byTarget["darwin-arm64"].archive, "zip");
    assert.equal(
      byTarget["darwin-x64"].entry,
      "Blinkling.app/Contents/MacOS/Blinkling",
    );
    assert.equal(byTarget["win32-x64"].archive, "file");
    assert.equal(byTarget["linux-x64"].archive, "file");
    assert.equal(
      byTarget["linux-x64"].entry,
      "Blinkling-3.0.0-linux-x64.AppImage",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing asset or a bad version stops the release instead of shipping a partial manifest", async () => {
  const { dir } = await assets("3.0.0", "Blinkling-3.0.0-win-x64.exe");
  try {
    await assert.rejects(
      buildManifest({ version: "3.0.0", directory: dir }),
      /Blinkling-3\.0\.0-win-x64\.exe/,
    );
    await assert.rejects(
      buildManifest({ version: "v3", directory: dir }),
      /version/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeRelease writes the plugin manifest and a SHA256SUMS that match the files", async () => {
  const { dir } = await assets("3.0.0");
  const out = await mkdtemp(join(tmpdir(), "blinkling-manifest-"));
  try {
    const manifestPath = join(out, "plugin", "manifest.json");
    await mkdir(join(out, "plugin"));
    await writeRelease({
      version: "3.0.0",
      directory: dir,
      manifestPath,
      sumsPath: join(dir, "SHA256SUMS"),
    });
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const sums = (await readFile(join(dir, "SHA256SUMS"), "utf8"))
      .trim()
      .split("\n");
    assert.equal(sums.length, 4);
    for (const line of sums) {
      const [digest, name] = line.split("  ");
      assert.equal(sha(await readFile(join(dir, name))), digest);
      assert.ok(manifest.builds.some((b) => b.sha256 === digest));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});
