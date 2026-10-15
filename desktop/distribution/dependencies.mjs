import { cp, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
/** Copy the installed, lockfile-resolved production dependency graph even when
 * npm workspaces hoist it outside the app directory. No install during packaging.
 * `skip` names packages this target never loads (uiohook-napi on macOS).
 */
export async function copyDependencies(
  sourcePackage,
  destination,
  { skip = [] } = {},
) {
  const manifest = JSON.parse(await readFile(sourcePackage, "utf8"));
  const resolve = createRequire(sourcePackage).resolve;
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (skip.includes(name)) continue;
    const dependency = resolve(`${name}/package.json`);
    const target = join(destination, "node_modules", name);
    await mkdir(dirname(target), { recursive: true });
    await cp(dirname(dependency), target, {
      recursive: true,
      dereference: true,
      filter: (source) =>
        !source.includes(`${join(dirname(dependency), "node_modules")}`),
    });
    await copyDependencies(dependency, target, { skip });
  }
}
