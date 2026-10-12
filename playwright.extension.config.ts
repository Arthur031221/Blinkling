import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-extension",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: "line",
  use: { headless: false, viewport: null },
});
