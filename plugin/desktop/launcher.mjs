import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, cp, rename, rm, mkdir, lstat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import pinnedManifest from "./manifest.json" with { type: "json" };
import {
  installDesktop,
  privateDirectory,
  atomicJson,
  withLock,
} from "./install.mjs";
import { discoverDesktop } from "./client.mjs";
import { runtimeDirectory, endpointPath } from "./paths.mjs";
/** Trust only the plugin-embedded release manifest, never adjacent web checksums. */
export function selectBuild(
  manifest,
  platform = process.platform,
  arch = process.arch,
) {
  if (!manifest || !Array.isArray(manifest.builds))
    throw new Error("Invalid pinned desktop manifest");
  const matches = manifest.builds.filter(
    (b) => b.platform === platform && b.arch === arch,
  );
  if (matches.length > 1) throw new Error("Duplicate desktop target");
  const build = matches[0];
  if (!build)
    throw new Error(`Unsupported desktop target: ${platform}/${arch}`);
  const url = new URL(build.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith("/Arthur031221/Glimpselet/releases/download/")
  )
    throw new Error("Invalid release origin");
  if (!/^[a-f0-9]{64}$/.test(build.sha256))
    throw new Error("Invalid release digest");
  return build;
}
export function verifyArchive(bytes, build) {
  if (createHash("sha256").update(bytes).digest("hex") !== build.sha256)
    throw new Error("Desktop archive checksum mismatch");
}
export async function desktopEnabled(directory = runtimeDirectory()) {
  try {
    return (
      JSON.parse(await readFile(join(directory, "enabled.json"), "utf8"))
        .enabled === true
    );
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
export async function launchDesktop(options = {}) {
  const directory = options.runtime || runtimeDirectory();
  await privateDirectory(directory);
  const descriptor =
    options.descriptor ||
    (options.runtime ? join(directory, "desktop.json") : endpointPath());
  return withLock(join(directory, "launch.lock"), async () => {
    const previous = await discoverDesktop(descriptor);
    if (previous) {
      await previous.client.rpc(options.background ? "reconnect" : "open");
      await atomicJson(join(directory, "enabled.json"), { enabled: true });
      return { ...previous.status, alreadyRunning: true };
    }
    if (
      (options.platform || process.platform) === "linux" &&
      !process.env.DISPLAY &&
      !process.env.WAYLAND_DISPLAY &&
      !options.spawn
    )
      throw new Error(
        "Blink needs a graphical desktop on this computer. Run /blinkling:blinkling in local Claude Code.",
      );
    const installed = await installDesktop(
      options.manifest || pinnedManifest,
      options,
    );
    let entry = installed.entry,
      macPrevious;
    // TCC identifies a stable bundle and installation path. Preserve that path.
    if (process.platform === "darwin") {
      const appPart = installed.build.entry
        .split("/")
        .findIndex((p) => p.endsWith(".app"));
      const source = join(
        installed.directory,
        ...installed.build.entry.split("/").slice(0, appPart + 1),
      );
      const applications = join(homedir(), "Applications");
      await mkdir(applications, { recursive: true });
      if (!(await lstat(applications)).isDirectory())
        throw new Error("Applications must be a real directory");
      const target = join(applications, "Blinkling.app"),
        stage = `${target}.staging`;
      macPrevious = `${target}.previous`;
      await rm(stage, { recursive: true, force: true });
      await cp(source, stage, { recursive: true, dereference: false });
      await rm(macPrevious, { recursive: true, force: true });
      try {
        await rename(target, macPrevious);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      try {
        await rename(stage, target);
      } catch (error) {
        await rename(macPrevious, target).catch(() => {});
        throw error;
      }
      entry = join(
        target,
        ...installed.build.entry.split("/").slice(appPart + 1),
      );
    }
    let child;
    try {
      child = (options.spawn || spawn)(entry, options.args || [], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, BLINKLING_RUNTIME_DIR: directory },
      });
      let failure;
      child.once("error", (error) => {
        failure = error;
      });
      child.once("exit", (code, signal) => {
        failure = new Error(`Blink exited before startup (${signal || code})`);
      });
      child.unref();
      const deadline = Date.now() + (options.startTimeoutMs ?? 30_000);
      while (Date.now() < deadline) {
        if (failure) throw failure;
        const running = await discoverDesktop(descriptor);
        if (running) {
          if (running.status.version !== installed.version)
            throw new Error("A different Blink version is running");
          await running.client.rpc(options.background ? "reconnect" : "open");
          await atomicJson(join(directory, "enabled.json"), { enabled: true });
          await atomicJson(join(installed.root, "current.json"), {
            version: installed.version,
            directory: installed.directory,
            entry,
          });
          if (macPrevious)
            await rm(macPrevious, { recursive: true, force: true }).catch(
              () => {},
            );
          return { ...running.status, alreadyRunning: false };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(
        "Blink did not finish starting. The previous verified build is preserved.",
      );
    } catch (error) {
      child?.kill();
      if (macPrevious) {
        const target = join(dirname(macPrevious), "Blinkling.app");
        await rm(target, { recursive: true, force: true });
        await rename(macPrevious, target).catch(() => {});
      }
      throw error;
    }
  });
}
