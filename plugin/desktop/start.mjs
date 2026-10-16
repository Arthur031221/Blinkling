#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { adoptLegacyEnv, migrateLegacyData } from "./legacy.mjs";
adoptLegacyEnv();
const {
  desktopEnabled,
  launchDesktop,
  verifyInstalled,
  startWithClaudeCode,
  userDataDirectory,
} = await import("./launcher.mjs");
const { runtimeDirectory } = await import("./paths.mjs");
const background = process.argv.includes("--background");
if (process.argv.includes("--verify")) {
  // Started detached by a start that trusted the installed build's
  // fingerprint: the byte for byte check happens here, off the session's path.
  await verifyInstalled().catch(() => {});
  process.exit(0);
}
if (process.argv.includes("--stop")) {
  // SessionEnd: the last Claude Code session to close takes Blink with it.
  try {
    const { stopWithSession, hookSessionId } = await import("./sessions.mjs");
    await stopWithSession({ id: await hookSessionId() });
  } catch (error) {
    process.stderr.write(`Blinkling: ${error.message}\n`);
  }
  process.exit(0);
}
try {
  await migrateLegacyData().catch(() => undefined);
  if (
    !background ||
    ((await desktopEnabled()) &&
      (await startWithClaudeCode(userDataDirectory())))
  ) {
    const { joinSession, hookSessionId } = await import("./sessions.mjs");
    const id = await hookSessionId();
    if (id) await joinSession(runtimeDirectory(), id).catch(() => {});
    const result = await launchDesktop({
      background,
      deferVerification: true,
    });
    if (result.verifyLater)
      spawn(process.execPath, [fileURLToPath(import.meta.url), "--verify"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
  }
} catch (error) {
  process.stderr.write(`Blinkling: ${error.message}\n`);
  if (!background) process.exitCode = 1;
}
