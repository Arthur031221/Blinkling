import { packager } from "@electron/packager";
import { fileURLToPath } from "node:url";
import { copyDependencies } from "./dependencies.mjs";
import { cp } from "node:fs/promises";
import { join } from "node:path";
const output = await packager({
  dir: fileURLToPath(new URL("..", import.meta.url)),
  out: fileURLToPath(new URL("../../release/desktop", import.meta.url)),
  name: "Blinkling",
  appBundleId: "com.blinkling.desktop",
  appVersion: "3.0.0",
  electronVersion: "44.7.2",
  platform: process.platform,
  arch: process.env.BLINKLING_TARGET_ARCH || process.arch,
  overwrite: true,
  prune: true,
  asar: true,
  afterCopy: [
    async ({ buildPath }) => {
      await copyDependencies(
        fileURLToPath(new URL("../package.json", import.meta.url)),
        buildPath,
      );
      await cp(
        fileURLToPath(new URL("../../plugin/desktop", import.meta.url)),
        join(buildPath, "companion"),
        {
          recursive: true,
          filter: (path) =>
            !path.endsWith(".test.mjs") && !path.endsWith(".d.mts"),
        },
      );
    },
  ],
  ignore: [
    /\/e2e($|\/)/,
    /\/acceptance($|\/)/,
    /\/distribution($|\/)/,
    /\/(\.test-claude|test-results|test)($|\/)/,
    /\.test\.mjs$/,
  ],
  ...(process.platform === "darwin"
    ? { osxSign: { identity: "-", type: "development" } }
    : {}),
});
console.log(output.join("\n"));
