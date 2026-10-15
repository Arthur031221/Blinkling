import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./shell.mjs", import.meta.url), "utf8");
const lines = source.split("\n");
const line = (pattern) => lines.findIndex((text) => pattern.test(text));

test("blinklingTest.blink exists before the shell's first await that follows creating Blink", () => {
  const created = line(/^const blink = new BrowserWindow\(/);
  assert.ok(created > 0, "the Blink window is created at the top level");
  const hook = line(/^\s*globalThis\.blinklingTest = \{/);
  assert.ok(hook > created, "the test hook is assigned after Blink exists");
  const awaited = lines.findIndex(
    (text, index) => index > created && /^(?:\S.*)?\bawait\b/.test(text),
  );
  assert.ok(
    awaited > hook,
    `first await at line ${awaited + 1}, hook at ${hook + 1}`,
  );
});

test("the hook is extended later, never replaced, and still exposes the composer getter", () => {
  const assignments = lines.filter((text) =>
    /globalThis\.blinklingTest = /.test(text),
  );
  assert.equal(assignments.length, 1, "one assignment; later code extends it");
  assert.match(source, /get composer\(\) \{\s*return composer;/);
  assert.match(source, /Object\.assign\(globalThis\.blinklingTest/);
});
