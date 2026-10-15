import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Automated runs of the product must never create a Remote Control session in
// the account holder's list. Each entry point either imports the shared test
// environment (which sets BLINKLING_REMOTE=0) or sets the switch itself.
const entryPoints = [
  "playwright.config.ts",
  "playwright.extension.config.ts",
  "scripts/screen-e2e.mjs",
  "scripts/mcp-e2e.mjs",
  "scripts/launcher-test.mjs",
  "scripts/record-demo.mjs",
  "scripts/record-real-demos.mjs",
  "scripts/plugin-upgrade-test.mjs",
  "scripts/extension-e2e.sh",
  "scripts/screen-e2e.sh",
];

for (const file of entryPoints)
  test(`${file} keeps Remote Control off`, async () => {
    const text = await readFile(file, "utf8");
    assert.match(
      text,
      /test-env\.mjs|BLINKLING_REMOTE[^a-zA-Z\n]{0,10}(0|test)/,
      `${file} must import desktop/shared/test-env.mjs or set BLINKLING_REMOTE`,
    );
  });

test("only the one disposable final check may enable Remote Control", async () => {
  const text = await readFile("desktop/shared/test-env.mjs", "utf8");
  assert.match(text, /BLINKLING_REMOTE \?\?= "0"/);
});
