import "../shared/test-env.mjs";
import { defineConfig } from "@playwright/test";
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
