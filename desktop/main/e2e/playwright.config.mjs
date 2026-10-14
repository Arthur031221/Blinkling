import "../../shared/test-env.mjs";
import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { report } from "./artifacts.mjs";
// Automated runs never create Remote Control sessions.
process.env.BLINKLING_REMOTE ??= "0";
export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.mjs",
  timeout: 90000,
  workers: 1,
  retries: 0,
  outputDir: join(report, "playwright"),
  reporter: [["list"]],
});
