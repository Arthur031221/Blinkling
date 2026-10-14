import "../../shared/test-env.mjs";
import { defineConfig } from "@playwright/test";
// Automated runs never create Remote Control sessions.
process.env.BLINKLING_REMOTE ??= "0";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  timeout: 60000,
  workers: 1,
  retries: 0,
  outputDir: "../../../../test-results/shell",
  reporter: "list",
});
