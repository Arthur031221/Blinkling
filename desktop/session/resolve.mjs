import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

const { delimiter, dirname, join } = win32;

const found = new Map();
/** The folders a Claude Code install lands in: the native installer, Homebrew,
 * npm and the common version managers. */
const knownFolders = (home) => [
  posix.join(home, ".local", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  posix.join(home, ".claude", "local"),
  posix.join(home, ".npm-global", "bin"),
  posix.join(home, ".volta", "bin"),
  posix.join(home, ".bun", "bin"),
  posix.join(home, ".yarn", "bin"),
  "/usr/bin",
];
/** Never synchronous: a login shell loads the user's whole profile, and the
 * main process must keep painting Blink while it does. */
const runShell = (file, args, options) =>
  new Promise((resolve) =>
    execFile(file, args, options, (_, stdout) => resolve({ stdout })),
  );
/** A Mac app opened from Finder, the Dock or Spotlight starts with only
 * /usr/bin:/bin:/usr/sbin:/sbin, so ask the user's own login shell where
 * claude lives. Bounded, and the answer must be an absolute path. */
export async function loginShellProbe({
  env = process.env,
  run = runShell,
  exists = existsSync,
} = {}) {
  const shell =
    env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  const out = await run(shell, ["-ilc", "command -v claude"], {
    encoding: "utf8",
    timeout: 5000,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const line = String(out?.stdout ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .reverse()
    .find((l) => posix.isAbsolute(l));
  return line && exists(line) ? line : null;
}
const PROBE_RETRY_MS = 60000;
async function resolvePosix(env, exists, home, probe, cache, now) {
  const cached = cache.get("claude");
  if (cached && exists(cached)) return cached;
  const candidates = [
    ...(env.PATH ?? "").split(posix.delimiter).filter(Boolean),
    ...knownFolders(home),
  ].map((folder) => posix.join(folder, "claude"));
  let hit = candidates.find((file) => exists(file)) ?? null;
  // The login shell can take seconds, so a miss is not asked again for a minute.
  if (!hit && now() - (cache.get("missedAt") ?? -Infinity) >= PROBE_RETRY_MS) {
    hit = await probe();
    if (!hit) cache.set("missedAt", now());
  }
  if (hit) cache.set("claude", hit);
  return hit;
}

/** Windows starts a program without a shell only when it is a real .exe.
 * Claude Code from the native installer is claude.exe, but an npm install
 * leaves claude.cmd, a shim that cannot be started without cmd.exe (whose
 * quoting would break our arguments). Look through PATH for the .exe, and for
 * a .cmd read the package it points at: its own claude.exe, or cli.js run by
 * node. Anywhere else, and for any path that is not the bare name "claude",
 * the command is returned unchanged. On macOS and Linux the bare name is
 * looked up on PATH, in the known install folders and then in the login shell. */
export async function resolveClaude(
  executable,
  {
    platform = process.platform,
    env = process.env,
    exists = existsSync,
    home = homedir(),
    probe = () => loginShellProbe({ env, exists }),
    cache = found,
    now = Date.now,
  } = {},
) {
  if (executable !== "claude") return { command: executable, args: [] };
  if (platform !== "win32") {
    const path = await resolvePosix(env, exists, home, probe, cache, now);
    return { command: path ?? executable, args: [] };
  }
  const folders = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  for (const folder of folders)
    if (exists(join(folder, "claude.exe")))
      return { command: join(folder, "claude.exe"), args: [] };
  for (const folder of folders) {
    if (!exists(join(folder, "claude.cmd"))) continue;
    const pkg = join(dirname(join(folder, "claude.cmd")), "node_modules");
    const base = join(pkg, "@anthropic-ai", "claude-code");
    if (exists(join(base, "bin", "claude.exe")))
      return { command: join(base, "bin", "claude.exe"), args: [] };
    if (exists(join(base, "cli.js")))
      return { command: "node", args: [join(base, "cli.js")] };
  }
  return { command: executable, args: [] };
}
