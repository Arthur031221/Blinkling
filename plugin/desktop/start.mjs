#!/usr/bin/env node
import { adoptLegacyEnv, migrateLegacyData } from "./legacy.mjs";
adoptLegacyEnv();
const {
  desktopEnabled,
  launchDesktop,
  startWithClaudeCode,
  userDataDirectory,
} = await import("./launcher.mjs");
const { runtimeDirectory } = await import("./paths.mjs");
const background = process.argv.includes("--background");
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
    await launchDesktop({ background });
  }
} catch (error) {
  process.stderr.write(`Blinkling: ${error.message}\n`);
  if (!background) process.exitCode = 1;
}
