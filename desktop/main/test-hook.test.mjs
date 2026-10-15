import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("./shell.mjs", import.meta.url), "utf8");
const file = ts.createSourceFile(
  "shell.mjs",
  source,
  ts.ScriptTarget.Latest,
  true,
);

/** True when the node awaits at module level, not inside a function it defines. */
function awaitsAtTopLevel(node) {
  let found = false;
  const visit = (child) => {
    if (found || ts.isFunctionLike(child)) return;
    if (ts.isAwaitExpression(child)) found = true;
    else ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

const text = (node) => node.getText(file);
const statements = file.statements;
const index = (predicate) => statements.findIndex(predicate);

const creates = index(
  (s) =>
    ts.isVariableStatement(s) && /\bblink = new BrowserWindow\(/.test(text(s)),
);
const assigns = statements
  .map((s, i) => [s, i])
  .filter(([s]) =>
    /^\s*(if \([^)]*\)\s*)?globalThis\.blinklingTest\s*=[^=]/.test(text(s)),
  );

test("the end-to-end hook is installed once, as a single assignment", () => {
  assert.ok(creates >= 0, "Blink is created at module level");
  assert.equal(
    assigns.length,
    1,
    "later code extends the hook and never replaces it",
  );
});

test("blinklingTest exists before the first top-level await after Blink is created", () => {
  const firstAwait = statements.findIndex(
    (s, i) => i > creates && awaitsAtTopLevel(s),
  );
  assert.ok(
    firstAwait > creates,
    "the shell awaits something after creating Blink",
  );
  assert.ok(
    assigns[0][1] < firstAwait,
    `blinklingTest is assigned at statement ${assigns[0][1]}, after the first await at ${firstAwait}`,
  );
});

test("blinklingTest exists before Blink's first show", () => {
  const show = index(
    (s, i) =>
      i > creates &&
      ts.isExpressionStatement(s) &&
      text(s.expression) === "blink.showInactive()",
  );
  assert.ok(show > creates, "the shell shows Blink at module level");
  assert.ok(assigns[0][1] < show);
});

test("the hook reaches Blink and the composer through getters", () => {
  const [[statement]] = assigns;
  assert.match(text(statement), /\bblink,/);
  assert.match(text(statement), /get composer\(\)/);
});
