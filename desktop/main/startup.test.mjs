import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("./shell.mjs", import.meta.url), "utf8");

test("the first-start notice never holds back the quit key, the click hook or the cursor poll", () => {
  const first = source.indexOf("welcome.openFirstTime()");
  assert.ok(first > 0, "the first start still opens the welcome");
  // Not awaited, and a failure of it is swallowed.
  assert.doesNotMatch(source, /await\s+welcome\./);
  assert.match(source, /void welcome\.openFirstTime\(\)\.catch\(/);
  // The quit key starts before the welcome exists at all.
  assert.ok(source.indexOf("quitKey.start()") < first);
  // Nothing between the welcome and the click hook or the poll waits on it.
  const hook = source.indexOf("hookedPress = createHookedPress");
  const poll = source.indexOf("const poll = setInterval");
  assert.ok(hook > first && poll > hook);
  const between = source.slice(first, poll);
  assert.doesNotMatch(between, /await\s+(welcome|dialog|systemPreferences)/);
});

test("a press that arrives before the click hook is built is ignored, never thrown", () => {
  // The variable is declared before anything can call it, and the callers
  // reach it with an optional call, so an early press does nothing.
  const declared = source.indexOf("let hookedPress;");
  const firstUse = source.indexOf("hookedPress?.(");
  const built = source.indexOf("hookedPress = createHookedPress");
  assert.ok(declared > 0 && declared < firstUse && firstUse < built);
  assert.doesNotMatch(source, /[^?.\w]hookedPress\(/);
  let hookedPress;
  assert.doesNotThrow(() => hookedPress?.());
});
