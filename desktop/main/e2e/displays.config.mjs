import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { report } from "./artifacts.mjs";
export default defineConfig({
  testDir: ".",
  testMatch: "displays.spec.mjs",
  timeout: 90000,
  workers: 1,
  retries: 0,
  outputDir: join(report, "display-results"),
  reporter: [["list"]],
});
