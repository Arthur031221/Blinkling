import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicJson, withLock, privateDirectory } from "./install.mjs";
import { discoverDesktop } from "./client.mjs";
import { runtimeDirectory } from "./paths.mjs";

/** A session that never reported its end (a crash, a killed terminal) stops
 * counting after this long, so it cannot keep Blink running for good. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
async function read(file) {
  try {
    const list = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(list)
      ? list.filter((e) => typeof e?.id === "string" && Number.isFinite(e.at))
      : [];
  } catch {
    return [];
  }
}
/** Blink stays while any Claude Code session that started it is open. Each
 * session is its id from the hook payload. `change` edits the list under a lock. */
async function update(directory, now, change) {
  await privateDirectory(directory);
  return withLock(join(directory, "sessions.lock"), async () => {
    const file = join(directory, "sessions.json");
    const list = change(
      (await read(file)).filter((e) => now - e.at < SESSION_TTL_MS),
    );
    await atomicJson(file, list);
    return list;
  });
}
export const joinSession = (directory, id, now = Date.now()) =>
  update(directory, now, (list) => [
    ...list.filter((e) => e.id !== id),
    { id, at: now },
  ]);
export const leaveSession = (directory, id, now = Date.now()) =>
  update(directory, now, (list) => list.filter((e) => e.id !== id));

/** The session id Claude Code sends to a hook on stdin; empty when there is none. */
export async function hookSessionId(stream = process.stdin, waitMs = 1000) {
  if (stream.isTTY) return "";
  let text = "";
  const done = new Promise((resolve) => {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (text += chunk));
    stream.on("end", resolve);
    stream.on("error", resolve);
  });
  let timer;
  await Promise.race([
    done,
    new Promise((r) => (timer = setTimeout(r, waitMs))),
  ]);
  clearTimeout(timer);
  stream.destroy?.();
  try {
    const id = JSON.parse(text).session_id;
    return typeof id === "string" ? id : "";
  } catch {
    return "";
  }
}

/** Ends one Claude Code session. The last one to leave quits Blink, and the
 * "start with Claude Code" marker is kept so the next session starts it again. */
export async function stopWithSession({
  directory = runtimeDirectory(),
  id,
  now = Date.now(),
  descriptor = join(directory, "desktop.json"),
} = {}) {
  // Without an id nothing says which session ended, so Blink stays.
  if (!id) return { stopped: false, remaining: -1 };
  const remaining = await leaveSession(directory, id, now);
  if (remaining.length) return { stopped: false, remaining: remaining.length };
  const running = await discoverDesktop(descriptor, { timeoutMs: 2000 });
  if (!running) return { stopped: false, remaining: 0 };
  await running.client.rpc("shutdown");
  await atomicJson(join(directory, "enabled.json"), { enabled: true });
  return { stopped: true, remaining: 0 };
}
