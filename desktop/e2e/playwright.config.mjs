import "../shared/test-env.mjs";
import { defineConfig } from "@playwright/test";
// Automated runs never create Remote Control sessions.
process.env.BLINKLING_REMOTE ??= "0";
export default defineConfig({
  testDir: ".",
  timeout: 45000,
  // A stalled native step fails at its own line in seconds instead of eating
  // the whole test timeout, and a shared runner gets one retry.
  expect: { timeout: 10000 },
  use: { actionTimeout: 20000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: "../../test-results/desktop",
  projects: [
    { name: "smoke", testMatch: "smoke.spec.mjs" },
    { name: "files", testMatch: "files.spec.mjs" },
    ...(process.platform === "linux"
      ? [
          { name: "linux-desktop", testMatch: "linux.spec.mjs" },
          { name: "integrated", testMatch: "integrated.spec.mjs" },
          { name: "menu-windows", testMatch: "menu-windows.spec.mjs" },
        ]
      : []),
  ],
});
