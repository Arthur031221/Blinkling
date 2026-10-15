import test from "node:test";
import assert from "node:assert/strict";
import { armQuitWatchdog } from "./quit.mjs";

test("a quit that hangs is forced after the deadline", async () => {
  let exited = 0;
  armQuitWatchdog(() => exited++, 20);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(exited, 1);
});

test("a quit that finishes cancels the watchdog", async () => {
  let exited = 0;
  const cancel = armQuitWatchdog(() => exited++, 20);
  cancel();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(exited, 0);
});
