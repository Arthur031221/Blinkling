import { execFileSync as run } from "node:child_process";

/** A synchronous native helper holds the whole test worker, so Playwright's
 * own timeouts cannot fire while it waits. Every helper is bounded here and a
 * stall fails by name instead of hanging the run until teardown. */
export function execFileSync(file, args = [], options = {}) {
  try {
    return run(file, args, {
      timeout: 15000,
      killSignal: "SIGKILL",
      ...options,
    });
  } catch (error) {
    if (error.code === "ETIMEDOUT") {
      throw new Error(
        `native helper ${file} stalled for ${options.timeout ?? 15000} ms`,
      );
    }
    throw error;
  }
}
