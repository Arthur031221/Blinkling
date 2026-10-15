import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { selectBuild } from "../../plugin/desktop/launcher.mjs";
import { TARGETS, assetName } from "./targets.mjs";

const REPOSITORY = "Arthur031221/Blinkling";

/** The pinned manifest the plugin embeds: one entry per shipped asset, with the
 * digest and size of the exact bytes that will be uploaded. */
export async function buildManifest({
  version,
  directory,
  repository = REPOSITORY,
  targets = TARGETS,
}) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`Invalid release version: ${version}`);
  const builds = [];
  for (const target of targets) {
    const name = assetName(target, version);
    let bytes;
    try {
      bytes = await readFile(join(directory, name));
    } catch (error) {
      if (error.code === "ENOENT")
        throw new Error(`Release asset is missing: ${name}`);
      throw error;
    }
    builds.push({
      os: target.os,
      arch: target.arch,
      archive: target.archive,
      entry: target.entry ?? name,
      url: `https://github.com/${repository}/releases/download/v${version}/${name}`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    });
  }
  const manifest = { schemaVersion: 1, version, builds };
  // The launcher must be able to use every entry it will be handed.
  for (const build of builds) selectBuild(manifest, build.os, build.arch);
  return manifest;
}

export async function writeRelease({
  version,
  directory,
  manifestPath,
  sumsPath,
  repository,
}) {
  const manifest = await buildManifest({ version, directory, repository });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    sumsPath,
    manifest.builds
      .map((build) => `${build.sha256}  ${build.url.split("/").pop()}\n`)
      .join(""),
  );
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, directory, manifestPath = "plugin/desktop/manifest.json"] =
    process.argv.slice(2);
  await writeRelease({
    version,
    directory,
    manifestPath,
    sumsPath: join(directory, "SHA256SUMS"),
  });
  console.log(`Pinned four desktop builds for ${version} in ${manifestPath}`);
}
