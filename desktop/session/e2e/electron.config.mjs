import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "electron.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 45000,
  outputDir: "../../../test-results/session",
});
