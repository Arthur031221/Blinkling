#!/usr/bin/env node
import { desktopEnabled, launchDesktop } from "./launcher.mjs";
const background = process.argv.includes("--background");
try {
  if (!background || (await desktopEnabled()))
    await launchDesktop({ background });
} catch (error) {
  process.stderr.write(`Glimpselet: ${error.message}\n`);
  if (!background) process.exitCode = 1;
}
