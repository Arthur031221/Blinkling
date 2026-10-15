import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { selectBuild } from "../../plugin/desktop/launcher.mjs";

const MARKER =
  /\/\/ plugin\/desktop\/manifest\.json\r?\nvar \w+ = (\{[\s\S]*?\r?\n\});/;

/** Reads the manifest esbuild inlined into bin/blinkling.cjs. */
export function embeddedManifest(bundle) {
  const match = MARKER.exec(bundle);
  if (!match)
    throw new Error(
      "no embedded plugin/desktop/manifest.json found in the bundle",
    );
  // The literal is esbuild output for a JSON import: data only, evaluated in an empty context.
  const literal = runInNewContext(`(${match[1]})`, Object.create(null), {
    timeout: 1000,
  });
  // Leave the empty context's prototypes behind so the result compares with plain JSON.
  return JSON.parse(JSON.stringify(literal));
}

/** Throws unless the bundle embeds exactly the pinned manifest. */
export function checkBundle(bundle, manifest, label = "the bundle") {
  const embedded = embeddedManifest(bundle);
  if (!isDeepStrictEqual(embedded, manifest)) {
    throw new Error(
      `${label} embeds ${embedded.builds?.length ?? 0} builds for v${embedded.version}, ` +
        `which differs from plugin/desktop/manifest.json (${manifest.builds?.length ?? 0} builds for v${manifest.version}); ` +
        "rebuild it with: node scripts/build-plugin.mjs",
    );
  }
}

/** Resolves "os/arch" targets the way the launcher does at run time. */
export function resolveTargets(manifest, targets) {
  return targets.map((target) => {
    const [os, arch] = target.split("/");
    return selectBuild(manifest, os, arch);
  });
}

async function main(argv) {
  const targets = [];
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--resolve") targets.push(argv[(index += 1)]);
    else files.push(argv[index]);
  }
  const [
    bundleFile = "bin/blinkling.cjs",
    manifestFile = "plugin/desktop/manifest.json",
  ] = files;
  const bundle = await readFile(bundleFile, "utf8");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  try {
    checkBundle(bundle, manifest, bundleFile);
    const embedded = embeddedManifest(bundle);
    for (const build of resolveTargets(embedded, targets)) {
      console.log(`${build.os}/${build.arch} ${build.url}`);
    }
  } catch (error) {
    console.error(`${bundleFile}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
