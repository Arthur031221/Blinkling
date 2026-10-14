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
    // Runs under node:test through `npm run check:name`.
    exclude: ["scripts/check-name.test.mjs", "node_modules/**"],
  },
});
