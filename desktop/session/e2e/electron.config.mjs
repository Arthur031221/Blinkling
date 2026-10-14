import { defineConfig } from "@playwright/test";
// Automated runs never create Remote Control sessions.
process.env.GLIMPSELET_REMOTE ??= "0";
export default defineConfig({
  testDir: ".",
  testMatch: "electron.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 45000,
  outputDir: "../../../test-results/session",
});
