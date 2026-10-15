import { packager } from "@electron/packager";
import { fileURLToPath } from "node:url";
import { copyDependencies } from "./dependencies.mjs";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
/** macOS only: the key tap helper, compiled for both Macs and signed ad hoc on
 * its own, because `codesign --deep` on the app seals a loose file in
 * Resources without signing it as code and arm64 refuses unsigned code. */
async function buildKeytap() {
  const dir = fileURLToPath(new URL("../pick/native/build", import.meta.url));
  const source = fileURLToPath(
    new URL("../pick/native/keytap.c", import.meta.url),
  );
  const binary = join(dir, "blinkling-keytap");
  await mkdir(dir, { recursive: true });
  const run = (command, args) =>
    execFileSync(command, args, { stdio: "inherit" });
  run("clang", [
    "-O2",
    "-Wall",
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    "-framework",
    "ApplicationServices",
    "-framework",
    "CoreFoundation",
    source,
    "-o",
    binary,
  ]);
  run("codesign", [
    "--force",
    "--sign",
    "-",
    "--identifier",
    "com.blinkling.desktop.keytap",
    binary,
  ]);
  const archs = execFileSync("lipo", ["-archs", binary], { encoding: "utf8" });
  if (!/arm64/.test(archs) || !/x86_64/.test(archs))
    throw new Error(`The key tap must hold both architectures, got: ${archs}`);
  run(binary, ["--selftest"]);
  return binary;
}
const keytap = process.platform === "darwin" ? await buildKeytap() : null;
const output = await packager({
  extraResource: keytap ? [keytap] : [],
  dir: fileURLToPath(new URL("..", import.meta.url)),
  out: fileURLToPath(new URL("../../release/desktop", import.meta.url)),
  name: "Blinkling",
  appBundleId: "com.blinkling.desktop",
  appVersion: version,
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
        // macOS reads keys through the helper process, never through uiohook.
        { skip: process.platform === "darwin" ? ["uiohook-napi"] : [] },
      );
      // The app root is desktop/, so shared/brand holds a stub that re-exports
      // assets/brand; the package carries the real Wordmark component instead.
      const brand = fileURLToPath(
        new URL("../../assets/brand", import.meta.url),
      );
      for (const file of ["wordmark.mjs", "wordmark-parts.json"]) {
        await cp(join(brand, file), join(buildPath, "shared", "brand", file));
      }
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
    /\/pick\/native($|\/)/,
    /\/acceptance($|\/)/,
    /\/distribution($|\/)/,
    /\/(\.test-claude|test-results|test)($|\/)/,
    /\.test\.mjs$/,
  ],
});
// There is no Apple Developer identity, so the app is signed ad hoc here with
// the system tool (the packager's own signing needs a keychain identity and
// only warns when there is none). A signature that does not verify fails the
// build, because macOS would refuse to start the app.
if (process.platform === "darwin")
  for (const dir of output) {
    const app = join(dir, "Blinkling.app");
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], {
      stdio: "inherit",
    });
    execFileSync("codesign", ["--verify", "--deep", "--strict", app], {
      stdio: "inherit",
    });
    // The packaged helper must still start from inside the signed bundle.
    execFileSync(
      join(app, "Contents", "Resources", "blinkling-keytap"),
      ["--selftest"],
      { stdio: "inherit" },
    );
  }
console.log(output.join("\n"));
