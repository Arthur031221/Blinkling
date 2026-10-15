import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { armHardQuitDeadline, armQuitWatchdog } from "./quit.mjs";

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

test("the hard deadline ends a process whose own thread is stuck", async () => {
  // The child blocks its main thread for good, so only the worker can end it.
  const dir = mkdtempSync(join(tmpdir(), "quit-"));
  const script = join(dir, "stuck.mjs");
  writeFileSync(
    script,
    `import { armHardQuitDeadline } from ${JSON.stringify(new URL("./quit.mjs", import.meta.url).href)};
armHardQuitDeadline(100);
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
`,
  );
  try {
    const child = spawn(process.execPath, [script], { stdio: "ignore" });
    const signal = await new Promise((resolve) =>
      child.on("exit", (_code, name) => resolve(name)),
    );
    assert.equal(signal, "SIGKILL");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the hard deadline does not keep a healthy process alive", () => {
  const worker = armHardQuitDeadline(60000, { pid: 0 });
  assert.equal(typeof worker.terminate, "function");
  worker.terminate();
});
