import "../../shared/test-env.mjs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "conversation.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 45000,
  outputDir: "../../../test-results/conversation",
  reporter: "list",
});
