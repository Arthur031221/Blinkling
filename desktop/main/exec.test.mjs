import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "./e2e/exec.mjs";

test("a native test helper that stalls fails by name instead of holding the worker", () => {
  const started = Date.now();
  assert.throws(
    () => execFileSync("sleep", ["30"], { timeout: 300 }),
    /native helper sleep stalled for 300 ms/,
  );
  assert.ok(Date.now() - started < 5000);
});

test("a helper that finishes returns its output and keeps its own errors", () => {
  assert.equal(execFileSync("echo", ["ok"]).toString().trim(), "ok");
  assert.throws(
    () => execFileSync("false"),
    (e) => e.status === 1,
  );
});
