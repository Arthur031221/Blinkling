import { defineConfig } from "@playwright/test";
// Automated runs never create Remote Control sessions.
process.env.BLINKLING_REMOTE ??= "0";
export default defineConfig({
  testDir: "./e2e-extension",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: "line",
  use: { headless: false, viewport: null },
});
