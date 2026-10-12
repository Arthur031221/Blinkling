import { defineConfig } from "@playwright/test";
import { env } from "node:process";
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  reporter: "line",
  use: { headless: true, baseURL: "http://127.0.0.1:5173" },
  webServer: {
    command: "GLIMPSELET_POLL_WATCH=1 npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !env.CI,
    timeout: 30_000,
  },
});
