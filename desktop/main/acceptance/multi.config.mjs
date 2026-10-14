import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "multi.testcase.mjs",
  timeout: 45000,
  workers: 1,
  retries: 0,
  outputDir: "../../../../test-results/shell-multi",
  reporter: "list",
});
