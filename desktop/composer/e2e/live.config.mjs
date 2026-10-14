import { defineConfig } from "@playwright/test";
// The one final check per job: a disposable "Glimpselet test" Remote Control session.
process.env.GLIMPSELET_REMOTE = "test";
export default defineConfig({
  testDir: ".",
  testMatch: "live.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 120000,
  outputDir: "../../../test-results/conversation-live",
  reporter: "list",
});
