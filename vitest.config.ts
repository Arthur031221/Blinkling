import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "bridge/src/**/*.test.ts",
      "bridge/test/**/*.test.ts",
      "extension/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
  },
});
