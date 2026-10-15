import { readFile } from "node:fs/promises";
import { selectBuild } from "../../plugin/desktop/launcher.mjs";
import { TARGETS } from "./targets.mjs";

const MARKER = "// plugin/desktop/manifest.json\nvar manifest_default = ";

/** The manifest esbuild inlined into bin/blinkling.cjs, the one the launcher trusts. */
export function embeddedManifest(bundleText) {
  const start = bundleText.indexOf(MARKER);
  if (start < 0)
    throw new Error("The bundle does not embed plugin/desktop/manifest.json");
  const from = start + MARKER.length;
  const end = bundleText.indexOf("\n};\n", from);
  if (end < 0) throw new Error("The embedded desktop manifest is not closed");
  // Our own build output: a plain object literal of strings and numbers.
  return new Function(`return ${bundleText.slice(from, end + 2)}`)();
}

/** What the launcher would download on each shipped target, from the bundle alone. */
export function resolveBundled(bundleText) {
  const manifest = embeddedManifest(bundleText);
  return TARGETS.map((target) =>
    selectBuild(manifest, target.os, target.arch),
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const resolved = resolveBundled(
    await readFile(process.argv[2] ?? "bin/blinkling.cjs", "utf8"),
  );
  for (const build of resolved)
    console.log(`${build.os}/${build.arch} -> ${build.url}`);
}
