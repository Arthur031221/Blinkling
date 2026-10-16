import { Worker } from "node:worker_threads";
import { difference } from "./policy.mjs";

/** The change check between two screen samples, run in a worker thread so the
 * main process never spends time on it. When the worker cannot start or dies,
 * the same check runs inline: a sample is never left without an answer. */
export function createDiff({
  spawn = () => new Worker(new URL("./diff-worker.mjs", import.meta.url)),
} = {}) {
  let worker = null,
    failed = false,
    next = 0;
  const waiting = new Map();
  const answer = (id, result) => {
    waiting.get(id)?.resolve(result);
    waiting.delete(id);
  };
  // What a gone worker still owed is answered inline.
  const drain = () => {
    failed = true;
    worker = null;
    for (const [id, { a, b }] of [...waiting]) answer(id, difference(a, b));
  };
  function start() {
    if (worker || failed) return worker;
    try {
      worker = spawn();
      worker.unref?.();
      worker.on("message", ({ id, result }) => answer(id, result));
      worker.on("error", drain);
      worker.on("exit", () => worker && drain());
    } catch {
      failed = true;
      worker = null;
    }
    return worker;
  }
  return {
    compare(a, b) {
      const live = start();
      if (!live) return Promise.resolve(difference(a, b));
      const id = ++next;
      return new Promise((resolve) => {
        waiting.set(id, { resolve, a, b });
        live.postMessage({ id, a, b });
      });
    },
    dispose() {
      const gone = worker;
      drain();
      gone?.terminate();
    },
  };
}
