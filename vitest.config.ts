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
    // These run under node:test: `npm run check:name`, `npm run check:brand`, `npm run test:features`.
    exclude: [
      "scripts/check-name.test.mjs",
      "scripts/remote-guard.test.mjs",
      "scripts/check-brand.kit.test.mjs",
      "node_modules/**",
    ],
  },
});
