import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["bridge/test/isolated-home.ts"],
    include: [
      "bridge/src/**/*.test.ts",
      "bridge/test/**/*.test.ts",
      "extension/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
    // These run under node:test: `npm run check:name` and `npm run test:features`.
    exclude: [
      "scripts/check-name.test.mjs",
      "scripts/features.test.mjs",
      "scripts/remote-guard.test.mjs",
      "node_modules/**",
    ],
  },
});
