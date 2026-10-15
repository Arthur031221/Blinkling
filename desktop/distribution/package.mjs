import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TARGETS, assetName, packagedDirectory } from "./targets.mjs";

const BUILDER = "electron-builder@26.17.0";
const ICON = fileURLToPath(new URL("./icons/blink-512.png", import.meta.url));

/** What turns an unpacked app into the release asset for one target. Pure so
 * the names and formats can be tested without building anything. */
export function packagePlan({ target, version, packaged, output }) {
  const asset = assetName(target, version);
  if (target.os === "darwin")
    return {
      tool: "ditto",
      args: [
        "-c",
        "-k",
        "--keepParent",
        join(packaged, "Blinkling.app"),
        join(output, asset),
      ],
    };
  const linux = target.os === "linux";
  return {
    tool: "electron-builder",
    package: BUILDER,
    args: [
      "--prepackaged",
      packaged,
      linux ? "--linux" : "--win",
      linux ? "AppImage" : "portable",
      `--${target.arch}`,
    ],
    config: {
      appId: "com.blinkling.desktop",
      productName: "Blinkling",
      artifactName: asset,
      directories: { output },
      extraMetadata: {
        version,
        description: "Blink, the Blinkling companion",
        author: { name: "Arthur031221" },
        desktopName: "blinkling.desktop",
      },
      ...(linux
        ? {
            linux: {
              target: "AppImage",
              category: "Utility",
              executableName: "Blinkling",
              icon: ICON,
              syncDesktopName: true,
            },
          }
        : { win: { target: "portable" } }),
    },
  };
}

function run(plan, scratch) {
  if (plan.tool === "ditto")
    return execFileSync("ditto", plan.args, { stdio: "inherit" });
  const config = join(scratch, "builder.json");
  return writeFile(config, JSON.stringify(plan.config)).then(() =>
    execFileSync(
      "npx",
      [
        "--yes",
        plan.package,
        ...plan.args,
        "--publish",
        "never",
        "--config",
        config,
      ],
      { stdio: "inherit", shell: process.platform === "win32" },
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const arch = process.env.BLINKLING_TARGET_ARCH || process.arch;
  const target = TARGETS.find(
    (t) => t.os === process.platform && t.arch === arch,
  );
  if (!target)
    throw new Error(`No Blinkling build for ${process.platform} ${arch}`);
  const version = JSON.parse(
    await readFile(join(root, "desktop/package.json"), "utf8"),
  ).version;
  const output = join(root, "release/assets");
  const scratch = join(root, "release/scratch");
  await rm(scratch, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await mkdir(scratch, { recursive: true });
  const plan = packagePlan({
    target,
    version,
    packaged: join(root, "release/desktop", packagedDirectory(target)),
    output,
  });
  await run(plan, scratch);
  await rm(scratch, { recursive: true, force: true });
  console.log(join(output, assetName(target, version)));
}
