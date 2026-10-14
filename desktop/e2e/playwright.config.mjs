import { defineConfig } from "@playwright/test";
// Automated runs never create Remote Control sessions.
process.env.GLIMPSELET_REMOTE ??= "0";
export default defineConfig({
  testDir: ".",
  timeout: 45000,
  workers: 1,
  retries: 0,
  outputDir: "../../test-results/desktop",
  projects: [
    { name: "smoke", testMatch: "smoke.spec.mjs" },
    { name: "files", testMatch: "files.spec.mjs" },
    ...(process.platform === "linux"
      ? [
          { name: "linux-desktop", testMatch: "linux.spec.mjs" },
          { name: "integrated", testMatch: "integrated.spec.mjs" },
        ]
      : []),
  ],
});
