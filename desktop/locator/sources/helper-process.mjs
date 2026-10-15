// Talks to the native accessibility helpers. The Linux one stays alive between
// requests (starting python and the bus takes longer than a hover allows); the
// macOS and Windows ones are scripts the system starts per request.
import { spawn } from "node:child_process";

const REQUEST_TIMEOUT = 4000;

// One JSON object per line in, one per line out, matched by id.
export function persistentRequest({
  command,
  args = [],
  env,
  timeout = REQUEST_TIMEOUT,
  spawnFn = spawn,
}) {
  let child = null;
  let nextId = 1;
  let buffer = "";
  const waiting = new Map();

  const fail = (error) => {
    for (const { reject, timer } of waiting.values()) {
      clearTimeout(timer);
      reject(error);
    }
    waiting.clear();
  };

  const ensure = () => {
    if (child) return child;
    const proc = spawnFn(command, args, {
      stdio: ["pipe", "pipe", "ignore"],
      env: { ...process.env, ...env },
    });
    child = proc;
    buffer = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      buffer += chunk;
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        let reply;
        try {
          reply = JSON.parse(line);
        } catch {
          continue;
        }
        const entry = waiting.get(reply.id);
        if (!entry) continue;
        waiting.delete(reply.id);
        clearTimeout(entry.timer);
        if (reply.ok) entry.resolve(reply.result);
        else entry.reject(new Error(reply.error || "helper failed"));
      }
    });
    const gone = (error) => {
      if (child === proc) child = null;
      fail(error instanceof Error ? error : new Error("helper exited"));
    };
    proc.on("error", gone);
    proc.on("exit", () => gone());
    proc.stdin.on("error", () => {});
    return proc;
  };

  const request = (cmd, payload) =>
    new Promise((resolve, reject) => {
      let proc;
      try {
        proc = ensure();
      } catch (error) {
        reject(error);
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error("helper timed out"));
      }, timeout);
      timer.unref?.();
      waiting.set(id, { resolve, reject, timer });
      proc.stdin.write(
        JSON.stringify({ id, cmd, window: payload ?? {} }) + "\n",
      );
    });

  // Starts the helper ahead of the first request: spawning takes tens of
  // milliseconds on the calling thread, which a hover cannot afford.
  request.warm = () => {
    try {
      ensure();
    } catch {
      // the first real request reports it
    }
  };

  request.close = () => {
    const proc = child;
    child = null;
    fail(new Error("helper closed"));
    proc?.kill();
  };
  return request;
}

// A command that is started for each request and prints one JSON document.
export function oneShotRequest({
  command,
  argsFor,
  input,
  timeout = REQUEST_TIMEOUT,
  spawnFn = spawn,
}) {
  const request = (cmd, payload) =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify({ cmd, window: payload ?? {} });
      const proc = spawnFn(command, argsFor(body), {
        stdio: ["pipe", "pipe", "ignore"],
      });
      let out = "";
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error("helper timed out"));
      }, timeout);
      timer.unref?.();
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => (out += chunk));
      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      proc.on("close", () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error("helper printed no JSON"));
        }
      });
      proc.stdin.on("error", () => {});
      proc.stdin.end(input ? input(body) : "");
    });
  request.close = () => {};
  return request;
}
