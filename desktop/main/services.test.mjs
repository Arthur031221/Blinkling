import test from "node:test";
import assert from "node:assert/strict";
import { registerAction, dispatchAction } from "./services.mjs";

test("actions receive shell context, await completion and propagate service failure", async () => {
  const context = { enabled: true };
  const dispose = registerAction("test-action", async (value) => {
    assert.equal(value, context);
    await Promise.resolve();
    return { ok: false, reason: "permission declined" };
  });
  assert.deepEqual(await dispatchAction("test-action", context), {
    ok: false,
    reason: "permission declined",
  });
  dispose();
  assert.equal((await dispatchAction("test-action", context)).ok, false);
});

test("disposing an older registration preserves its replacement", async () => {
  const old = registerAction("test-replace", () => {
    throw new Error("old handler");
  });
  const current = registerAction("test-replace", async () => {});
  old();
  assert.deepEqual(await dispatchAction("test-replace", {}), { ok: true });
  current();
});
