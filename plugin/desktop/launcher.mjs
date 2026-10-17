import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import {
  readFile,
  cp,
  rename,
  rm,
  mkdir,
  lstat,
  appendFile,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import pinnedManifest from "./manifest.json" with { type: "json" };
import {
  installDesktop,
  privateDirectory,
  atomicJson,
  withLock,
  treeFingerprint,
} from "./install.mjs";
import { discoverDesktop } from "./client.mjs";
import { runtimeDirectory, endpointPath } from "./paths.mjs";
import { chooseSandbox, readSandboxFacts, sandboxArgs } from "./sandbox.mjs";
/** GitHub redirects the old Glimpselet address to Blinkling. Both are ours. */
const RELEASE_PATHS = [
  "/Arthur031221/Blinkling/releases/download/",
  "/Arthur031221/Glimpselet/releases/download/",
];
/** Trust only the plugin-embedded release manifest, never adjacent web checksums. */
export function selectBuild(
  manifest,
  platform = process.platform,
  arch = process.arch,
) {
  if (!manifest || !Array.isArray(manifest.builds))
    throw new Error("Invalid pinned desktop manifest");
  if (manifest.builds.length === 0)
    throw new Error(
      "This copy of Blinkling has no release build pinned yet. Install the plugin from the marketplace, or build the desktop app from source (docs/INSTALL.md).",
    );
  const matches = manifest.builds.filter(
    (b) => b.os === platform && b.arch === arch,
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
    !RELEASE_PATHS.some((path) => url.pathname.startsWith(path))
  )
    throw new Error("Invalid release origin");
  if (!/^[a-f0-9]{64}$/.test(build.sha256))
    throw new Error("Invalid release digest");
  if (
    build.size !== undefined &&
    !(Number.isSafeInteger(build.size) && build.size > 0)
  )
    throw new Error("Invalid release size");
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
/** Start with Claude Code is on unless the user turned it off in settings.
 * An unreadable or unfinished settings file never switches Blink off. */
export async function startWithClaudeCode(userData) {
  try {
    const settings = JSON.parse(
      await readFile(join(userData, "settings.json"), "utf8"),
    );
    return settings?.startWithClaudeCode !== false;
  } catch {
    return true;
  }
}
/** The Electron user data directory of a Blink that this plugin launched. */
export const userDataDirectory = (runtime = runtimeDirectory()) =>
  join(runtime, "electron");
/** Whether a process id is a Blinkling or Electron process, so a recycled id
 * that now belongs to something else is never killed. */
async function looksLikeBlink(pid) {
  const [file, args] =
    process.platform === "win32"
      ? ["tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]]
      : ["ps", ["-p", String(pid), "-o", "comm="]];
  const output = await new Promise((resolve) =>
    execFile(file, args, { timeout: 5000 }, (_, out) => resolve(out || "")),
  );
  return /blinkling|electron/i.test(output);
}
/** A Blink whose endpoint no longer answers (hung, or its window server is
 * stuck) would otherwise make every new start die at its single instance lock
 * and look like nothing happened. Ends that one so a fresh start can take over.
 * Returns whether it ended one. */
export async function replaceHungDesktop(
  descriptor,
  {
    isAlive = (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return error.code === "EPERM";
      }
    },
    isBlink = looksLikeBlink,
    kill = (pid) => process.kill(pid, "SIGKILL"),
  } = {},
) {
  let endpoint;
  try {
    endpoint = JSON.parse(await readFile(descriptor, "utf8"));
  } catch {
    return false;
  }
  const pid = endpoint?.pid;
  let ended = false;
  if (
    Number.isInteger(pid) &&
    pid > 1 &&
    pid !== process.pid &&
    isAlive(pid) &&
    (await isBlink(pid))
  ) {
    try {
      kill(pid);
      ended = true;
    } catch {
      /* It exited on its own between the check and the kill. */
    }
  }
  await rm(descriptor, { force: true }).catch(() => {});
  return ended;
}
/** The full check of an installed build, run once Blink is already up: it
 * reads and hashes everything the fast start trusted a fingerprint for. A tree
 * that fails it loses its stamp, so the next start puts it right. */
export async function verifyInstalled(options = {}) {
  const directory = options.runtime || runtimeDirectory();
  try {
    await installDesktop(options.manifest || pinnedManifest, {
      ...options,
      full: true,
    });
    return true;
  } catch (error) {
    await appendFile(
      join(directory, "blinkling.log"),
      `Blinkling: ${error.message}\n`,
    ).catch(() => {});
    return false;
  }
}
/** What the macOS copy in ~/Applications was made from, and how it looked. */
const macMarker = (target) => `${target}.source.json`;
async function macCopyIsCurrent(target, installed) {
  try {
    const marker = JSON.parse(await readFile(macMarker(target), "utf8"));
    return (
      marker.source === installed.fingerprint &&
      marker.copy === (await treeFingerprint(target))
    );
  } catch {
    return false;
  }
}
/** A running Blink of another build than the one this plugin ships: left alone
 * it would keep answering with its own, older, screens. */
export function isOtherBuild(running, manifest) {
  const have = running?.status?.version;
  return Boolean(have && manifest?.version && have !== manifest.version);
}
export async function launchDesktop(options = {}) {
  const directory = options.runtime || runtimeDirectory();
  await privateDirectory(directory);
  const descriptor =
    options.descriptor ||
    (options.runtime ? join(directory, "desktop.json") : endpointPath());
  return withLock(join(directory, "launch.lock"), async () => {
    let previous = await discoverDesktop(descriptor);
    // A build left running from an earlier version is replaced, not reused.
    if (
      previous &&
      isOtherBuild(previous, options.manifest || pinnedManifest)
    ) {
      await replaceHungDesktop(descriptor, options.hung);
      previous = null;
    }
    if (previous) {
      await previous.client.rpc(options.background ? "reconnect" : "open", {
        session: options.session,
      });
      await atomicJson(join(directory, "enabled.json"), { enabled: true });
      return { ...previous.status, alreadyRunning: true };
    }
    await replaceHungDesktop(descriptor, options.hung);
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
      // The same build is already there, untouched: copying a few hundred
      // megabytes again would only delay Blink.
      if (!(await macCopyIsCurrent(target, installed))) {
        macPrevious = `${target}.previous`;
        await rm(stage, { recursive: true, force: true });
        await cp(source, stage, {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
        });
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
        await atomicJson(macMarker(target), {
          source: installed.fingerprint,
          copy: await treeFingerprint(target),
        }).catch(() => {});
      }
      entry = join(
        target,
        ...installed.build.entry.split("/").slice(appPart + 1),
      );
    }
    let child, log;
    try {
      // What Blink prints while starting goes to a private file next to the
      // runtime descriptor, so a start that never answers can be explained.
      log = openSync(join(directory, "blinkling.log"), "w", 0o600);
      const platform = options.platform || process.platform;
      // Prefer a sandbox that works on this machine; run without one only when
      // the kernel and the build leave no choice (stock Ubuntu 24.04).
      const sandbox = chooseSandbox(
        options.sandboxFacts ||
          (await readSandboxFacts({ platform, executable: entry })),
      );
      child = (options.spawn || spawn)(
        entry,
        [...sandboxArgs(sandbox), ...(options.args || [])],
        {
          detached: true,
          stdio: ["ignore", log, log],
          windowsHide: true,
          env: {
            ...process.env,
            BLINKLING_RUNTIME_DIR: directory,
            // An AppImage needs FUSE to mount itself; unpacking works anywhere.
            ...(installed.build.archive === "file" && platform === "linux"
              ? { APPIMAGE_EXTRACT_AND_RUN: "1" }
              : {}),
          },
        },
      );
      let failure;
      child.once("error", (error) => {
        failure = error;
      });
      child.once("exit", (code, signal) => {
        failure = new Error(`Blink exited before startup (${signal || code})`);
      });
      child.unref();
      closeSync(log);
      log = undefined;
      const deadline = Date.now() + (options.startTimeoutMs ?? 30_000);
      while (Date.now() < deadline) {
        if (failure) throw failure;
        const running = await discoverDesktop(descriptor);
        if (running) {
          if (running.status.version !== installed.version)
            throw new Error("A different Blink version is running");
          await running.client.rpc(options.background ? "reconnect" : "open", {
            session: options.session,
          });
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
          const result = { ...running.status, alreadyRunning: false };
          if (installed.fast) {
            // Blink is on screen; what the fast start took on trust is
            // checked now. A hook that must not linger asks for it to be run
            // as a separate process instead.
            if (options.deferVerification)
              Object.defineProperty(result, "verifyLater", { value: true });
            else void verifyInstalled(options);
          }
          return result;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      throw new Error(
        "Blink did not finish starting. The previous verified build is preserved.",
      );
    } catch (error) {
      if (log !== undefined) closeSync(log);
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
