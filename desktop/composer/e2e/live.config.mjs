import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "live.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 120000,
  outputDir: "../../../test-results/conversation-live",
  reporter: "list",
});
