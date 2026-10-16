import { parentPort } from "node:worker_threads";
import { difference } from "./policy.mjs";

// The difference check of two screen samples, off the main thread: the shell
// never waits on it, and the answer is only the verdict.
parentPort?.on("message", ({ id, a, b }) =>
  parentPort.postMessage({ id, result: difference(a, b) }),
);
