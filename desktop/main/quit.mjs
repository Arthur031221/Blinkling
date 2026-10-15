import { Worker } from "node:worker_threads";

/** Quitting must always finish. Disposal waits on the session, the host and the
 * locator; if any of them hangs, `exit` runs after `ms` so Blink still goes away.
 * Returns the function that cancels the watchdog. */
export function armQuitWatchdog(
  exit,
  ms = 3000,
  { setTimer = setTimeout, clearTimer = clearTimeout } = {},
) {
  const timer = setTimer(exit, ms);
  timer?.unref?.();
  return () => clearTimer(timer);
}

/** The backstop under the watchdog above. When the main thread is stuck inside
 * a native call, no timer on it ever runs, so this one lives on a worker thread
 * and ends the process itself. SIGKILL, because SIGTERM is handled on the same
 * stuck thread. */
export function armHardQuitDeadline(
  ms = 4000,
  { pid = process.pid, create = (...args) => new Worker(...args) } = {},
) {
  const worker = create(
    `const { workerData } = require("node:worker_threads");
setTimeout(() => process.kill(workerData.pid, "SIGKILL"), workerData.ms);`,
    { eval: true, workerData: { pid, ms } },
  );
  worker.unref?.();
  return worker;
}
