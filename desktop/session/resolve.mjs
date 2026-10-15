import { existsSync } from "node:fs";
import { win32 } from "node:path";

const { delimiter, dirname, join } = win32;

/** Windows starts a program without a shell only when it is a real .exe.
 * Claude Code from the native installer is claude.exe, but an npm install
 * leaves claude.cmd, a shim that cannot be started without cmd.exe (whose
 * quoting would break our arguments). Look through PATH for the .exe, and for
 * a .cmd read the package it points at: its own claude.exe, or cli.js run by
 * node. Anywhere else, and for any path that is not the bare name "claude",
 * the command is returned unchanged. */
export function resolveClaude(
  executable,
  { platform = process.platform, env = process.env, exists = existsSync } = {},
) {
  if (platform !== "win32" || executable !== "claude")
    return { command: executable, args: [] };
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
