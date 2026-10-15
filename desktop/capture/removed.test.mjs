import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const sources = [
  "./selection.mjs",
  "./selection.html",
  "./windows.mjs",
  "./integration.mjs",
  "./index.mjs",
  "./preload.cjs",
  "../main/shell.mjs",
  "../main/ipc.mjs",
  "../shared/contracts.ts",
];

test("capture has one action and no Shift key, full-page action or notice", async () => {
  for (const path of sources) {
    const text = await read(path);
    assert.doesNotMatch(text, /shiftKey/, `${path} reads Shift`);
    assert.doesNotMatch(text, /captureNotice/, `${path} has captureNotice`);
    assert.doesNotMatch(
      text,
      /["']full-page["']/,
      `${path} has a full-page action`,
    );
    assert.doesNotMatch(
      text,
      /action\s*[=:]=*\s*["'](screen|region)["']/,
      `${path} has a screen/region action`,
    );
  }
});
