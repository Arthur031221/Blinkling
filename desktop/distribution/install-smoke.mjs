#!/usr/bin/env node
// Installs a release the way a user does: start.mjs from a copy of the plugin,
// in a clean HOME, with the manifest pinning the given assets. Then checks that
// Blink answers /status and that the OS did not flag what we extracted.
import { execFileSync, spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildManifest } from "./manifest.mjs";
import { TARGETS } from "./targets.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const [version, assets] = process.argv.slice(2);
if (!version || !assets) {
  console.error("Usage: install-smoke.mjs <version> <assets-directory>");
  process.exit(2);
}

const root = await mkdtemp(join(tmpdir(), "blinkling-smoke-"));
const home = join(root, "home");
const plugin = join(root, "plugin");
await mkdir(home);
await cp(resolve(here, "../../plugin/desktop"), plugin, {
  recursive: true,
  filter: (path) => !path.endsWith(".test.mjs"),
});
// A per-OS job only has its own asset; the release job pins all four.
const manifest = await buildManifest({
  version,
  directory: resolve(assets),
  targets: TARGETS.filter(
    (t) => t.os === process.platform && t.arch === process.arch,
  ),
});
await writeFile(join(plugin, "manifest.json"), JSON.stringify(manifest));

const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  LOCALAPPDATA: join(home, "AppData", "Local"),
  BLINKLING_REMOTE: "0",
  BLINKLING_SMOKE_ASSETS: resolve(assets),
  NODE_OPTIONS: `--import ${pathToFileURL(join(here, "serve-assets.mjs")).href}`,
};
delete env.BLINKLING_RUNTIME_DIR;
delete env.GLIMPSELET_RUNTIME_DIR;

let pid;
try {
  const start = spawn(process.execPath, [join(plugin, "start.mjs")], {
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const code = await new Promise((done) => start.once("exit", done));
  if (code !== 0) throw new Error(`start.mjs exited with ${code}`);

  Object.assign(process.env, {
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: env.LOCALAPPDATA,
  });
  const { discoverDesktop } = await import(
    pathToFileURL(join(plugin, "client.mjs")).href
  );
  const running = await discoverDesktop(
    join(home, ".blinkling", "runtime", "desktop.json"),
  );
  if (!running) throw new Error("Blink is not answering /status");
  pid = running.status.pid;
  if (running.status.version !== version)
    throw new Error(
      `Blink reports ${running.status.version}, expected ${version}`,
    );
  console.log(
    `ok  /status answered: Blink ${running.status.version} (pid ${pid})`,
  );

  const { defaultInstallRoot } = await import(
    pathToFileURL(join(plugin, "install.mjs")).href
  );
  const current = JSON.parse(
    await readFile(join(defaultInstallRoot(), "current.json"), "utf8"),
  );
  if (process.platform === "darwin") {
    const app = join(homedir(), "Applications", "Blinkling.app");
    let quarantined = true;
    try {
      execFileSync("xattr", ["-p", "com.apple.quarantine", app], {
        stdio: "pipe",
      });
    } catch {
      quarantined = false;
    }
    if (quarantined)
      throw new Error("com.apple.quarantine is set on Blinkling.app");
    execFileSync("codesign", ["--verify", "--deep", "--strict", app], {
      stdio: "inherit",
    });
    console.log("ok  no com.apple.quarantine, codesign --verify passes");
  }
  if (process.platform === "win32") {
    const zone = `${current.entry}:Zone.Identifier`;
    const marked = await stat(zone).then(
      () => true,
      () => false,
    );
    if (marked)
      throw new Error(`Zone.Identifier stream present on ${current.entry}`);
    console.log("ok  no Zone.Identifier stream on the extracted exe");
  }
  await running.client.rpc("shutdown").catch(() => {});
  pid = undefined;
} finally {
  if (pid) {
    try {
      process.kill(pid);
    } catch {
      /* already gone */
    }
  }
  await rm(root, { recursive: true, force: true }).catch(() => {});
}
