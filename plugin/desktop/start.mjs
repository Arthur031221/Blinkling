#!/usr/bin/env node
import { adoptLegacyEnv, migrateLegacyData } from "./legacy.mjs";
adoptLegacyEnv();
const { desktopEnabled, launchDesktop } = await import("./launcher.mjs");
const background = process.argv.includes("--background");
try {
  await migrateLegacyData().catch(() => undefined);
  if (!background || (await desktopEnabled()))
    await launchDesktop({ background });
} catch (error) {
  process.stderr.write(`Blinkling: ${error.message}\n`);
  if (!background) process.exitCode = 1;
}
