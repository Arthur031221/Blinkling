import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { report } from "./artifacts.mjs";
export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.mjs",
  timeout: 90000,
  workers: 1,
  retries: 0,
  outputDir: join(report, "playwright"),
  reporter: [["list"]],
});
