import "../../shared/test-env.mjs";
import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { report } from "./artifacts.mjs";
// Automated runs never create Remote Control sessions.
process.env.GLIMPSELET_REMOTE ??= "0";
export default defineConfig({
  testDir: ".",
  testMatch: "displays.spec.mjs",
  timeout: 90000,
  workers: 1,
  retries: 0,
  outputDir: join(report, "display-results"),
  reporter: [["list"]],
});
