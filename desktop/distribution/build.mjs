import { packager } from "@electron/packager";
import { fileURLToPath } from "node:url";
import { copyDependencies } from "./dependencies.mjs";
const output = await packager({
  dir: fileURLToPath(new URL("..", import.meta.url)),
  out: fileURLToPath(new URL("../../release/desktop", import.meta.url)),
  name: "Glimpselet",
  appBundleId: "com.glimpselet.desktop",
  appVersion: "3.0.0",
  electronVersion: "44.7.2",
  platform: process.platform,
  arch: process.arch,
  overwrite: true,
  prune: true,
  asar: true,
  afterCopy: [
    async ({ buildPath }) =>
      copyDependencies(
        fileURLToPath(new URL("../package.json", import.meta.url)),
        buildPath,
      ),
  ],
  ignore: [/\/e2e($|\/)/, /\/distribution($|\/)/, /\.test\.mjs$/],
  ...(process.platform === "darwin"
    ? { osxSign: { identity: "-", type: "development" } }
    : {}),
});
console.log(output.join("\n"));
