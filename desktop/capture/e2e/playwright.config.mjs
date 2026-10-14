import "../../shared/test-env.mjs";
import { defineConfig } from "@playwright/test";
import { reports } from "./support.mjs";
// Automated runs never create Remote Control sessions.
process.env.GLIMPSELET_REMOTE ??= "0";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  timeout: 60000,
  workers: 1,
  retries: 0,
  outputDir: `${reports}/test-results`,
  reporter: [["list"], ["json", { outputFile: `${reports}/e2e-results.json` }]],
});
