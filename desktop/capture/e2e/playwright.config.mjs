import { defineConfig } from "@playwright/test";
import { reports } from "./support.mjs";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  timeout: 60000,
  workers: 1,
  retries: 0,
  outputDir: `${reports}/test-results`,
  reporter: [["list"], ["json", { outputFile: `${reports}/e2e-results.json` }]],
});
