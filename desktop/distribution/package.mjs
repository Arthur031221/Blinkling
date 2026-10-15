import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TARGETS, assetName, packagedDirectory } from "./targets.mjs";

const BUILDER = "electron-builder@26.17.0";
const APP = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const ICON = fileURLToPath(new URL("./icon.png", import.meta.url));

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
      // electron-builder reads its metadata from the working directory's
      // package.json, not the prepackaged app's, so the app's own fields are
      // handed over explicitly.
      extraMetadata: {
        version,
        description: APP.description,
        author: APP.author,
        desktopName: APP.desktopName,
      },
      ...(linux
        ? {
            linux: {
              target: "AppImage",
              category: "Utility",
              executableName: "Blinkling",
              icon: ICON,
              description: APP.description,
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
      ["--yes", plan.package, ...plan.args, "--config", config],
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
