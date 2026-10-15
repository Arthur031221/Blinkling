import { defineConfig } from "@playwright/test";
import { env } from "node:process";
// Automated runs never create Remote Control sessions.
env.BLINKLING_REMOTE ??= "0";
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  reporter: "line",
  use: { headless: true, baseURL: "http://127.0.0.1:5173" },
  webServer: {
    command: "BLINKLING_POLL_WATCH=1 npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !env.CI,
    timeout: 30_000,
  },
});
