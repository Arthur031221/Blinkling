import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["bridge/test/isolated-home.ts"],
    include: [
      "src/**/*.test.ts",
      "bridge/src/**/*.test.ts",
      "bridge/test/**/*.test.ts",
      "extension/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
  },
});
