import { existsSync } from "node:fs";
import { join } from "node:path";

const KINDS = {
  kd: "keydown",
  ku: "keyup",
  md: "mousedown",
  wh: "wheel",
};
/** How long the helper gets to answer "ready" or "denied" before it is dropped. */
const READY_MS = 3000;

/** Where the macOS key tap binary lives: next to the app's resources once
 * packaged, in the build folder when run from source. Null when it is missing. */
export function keytapPath({
  resourcesPath = process.resourcesPath,
  appDir,
  exists = existsSync,
} = {}) {
  const candidates = [
    resourcesPath && join(resourcesPath, "blinkling-keytap"),
    appDir && join(appDir, "pick", "native", "build", "blinkling-keytap"),
  ].filter(Boolean);
  return candidates.find((path) => exists(path)) ?? null;
}

/** Ends a helper without waiting for it: closing its stdin is what it watches,
 * the signal is the backup. A process that is already gone is not an error. */
function reap(proc) {
  for (const end of [
    () => proc.stdin?.destroy?.(),
    () => proc.kill("SIGTERM"),
  ]) {
    try {
      end();
    } catch (error) {
      void error;
    }
  }
}

/** The global key, wheel and mouse source for macOS: a small helper process
 * (native/keytap.c) prints one line per event. Nothing here waits on it, so a
 * stalled or crashed helper, or an input method that holds the main thread,
 * cannot block the app, and quitting only signals it.
 *
 * Same shape as `createKeySource`: start() resolves {ok:true} once the helper
 * has its tap, or {ok:false, error} when it was refused (error.code "DENIED"),
 * is missing ("MISSING"), died or stayed silent. Every start spawns a fresh
 * process, so a permission granted meanwhile is seen. */
export function createHelperKeySource({
  command,
  spawn,
  handle,
  onError = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  readyMs = READY_MS,
}) {
  let child = null;
  let held = new Set();
  const fail = (code, message) => Object.assign(new Error(message), { code });

  /** A modifier that was down when the helper went away is released, so the pick
   * gate never sees a key held forever. */
  const releaseHeld = () => {
    for (const code of held) handle({ type: "keyup", code });
    held = new Set();
  };

  const line = (text, ready) => {
    const [word, rest] = text.trim().split(/\s+/);
    if (word === "ready") return ready(null);
    if (word === "denied") return ready(fail("DENIED", "key tap refused"));
    const type = KINDS[word];
    if (!type) return;
    const code = Number(rest);
    if (type === "keydown") held.add(code);
    if (type === "keyup") held.delete(code);
    handle({
      type,
      code: type === "keydown" || type === "keyup" ? code : undefined,
    });
  };

  return {
    start() {
      if (child) return Promise.resolve({ ok: true });
      if (!command) {
        const error = fail("MISSING", "key tap helper not found");
        onError(error);
        return Promise.resolve({ ok: false, error });
      }
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        let proc;
        const settle = (error) => {
          if (settled) return;
          settled = true;
          if (timer !== null) clearTimer(timer);
          if (error) {
            if (proc === child) child = null;
            reap(proc);
            onError(error);
            resolve({ ok: false, error });
          } else {
            resolve({ ok: true });
          }
        };
        try {
          proc = spawn(command, [], { stdio: ["pipe", "pipe", "ignore"] });
        } catch (error) {
          return settle(error);
        }
        child = proc;
        let buffer = "";
        proc.stdout.setEncoding?.("utf8");
        proc.stdout.on("data", (chunk) => {
          buffer += chunk;
          let at;
          while ((at = buffer.indexOf("\n")) >= 0) {
            const text = buffer.slice(0, at);
            buffer = buffer.slice(at + 1);
            if (child === proc || !settled) line(text, settle);
          }
        });
        proc.on("error", (error) => settle(error));
        proc.on("exit", (code) => {
          const error = fail("EXIT", `key tap helper exited (${code})`);
          // Exiting before it said anything is a refusal or a crash; later it
          // is a crash, and the next start spawns a fresh one.
          if (!settled) return settle(error);
          if (proc !== child) return;
          child = null;
          releaseHeld();
          onError(error);
        });
        timer = setTimer(
          () => settle(fail("TIMEOUT", "key tap helper did not answer")),
          readyMs,
        );
      });
    },
    /** Signals the helper and moves on, on every quit path; it also ends by
     * itself when its stdin closes. */
    stop() {
      const proc = child;
      child = null;
      if (!proc) return;
      releaseHeld();
      reap(proc);
    },
    started: () => child !== null,
  };
}
