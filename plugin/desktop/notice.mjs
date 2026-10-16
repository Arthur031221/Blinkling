#!/usr/bin/env node
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverDesktop } from "./client.mjs";
import { runtimeDirectory } from "./paths.mjs";
import { takeQuit } from "./sessions.mjs";

export const QUIT_NOTICE =
  "Blink was closed, so what you type here no longer appears in it. Run /blinkling to start it again.";

/** The hook output for a session left behind by a closed Blink: one line shown
 * to the person in the terminal, once. Nothing when Blink is running again. */
export async function notice(payload, directory = runtimeDirectory()) {
  const session = payload?.session_id;
  if (typeof session !== "string" || !session) return undefined;
  if (!(await takeQuit(directory, session))) return undefined;
  const running = await discoverDesktop(join(directory, "desktop.json"), {
    timeoutMs: 1000,
  });
  return running ? undefined : { systemMessage: QUIT_NOTICE };
}

/** Whether the person typed the command that opens Blink. */
export const asksForBlink = (payload) =>
  typeof payload?.prompt === "string" &&
  /^\/blinkling(:blinkling)?(\s|$)/.test(payload.prompt.trim());

/** Starts Blink the moment the command is typed: the model's turn before its
 * desktop_open call takes seconds, and Blink need not wait for it. The start
 * is the same one the tool makes, so the tool finds Blink already running. */
export function openBlink(payload, spawnFn = spawn) {
  if (!asksForBlink(payload)) return false;
  const child = spawnFn(
    process.execPath,
    [fileURLToPath(new URL("./start.mjs", import.meta.url))],
    { detached: true, stdio: ["pipe", "ignore", "ignore"], windowsHide: true },
  );
  child.stdin?.on?.("error", () => {});
  child.stdin?.end(JSON.stringify(payload));
  child.unref();
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { hookPayload } = await import("./sessions.mjs");
  try {
    const payload = await hookPayload();
    openBlink(payload);
    const out = await notice(payload);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    /* The terminal must never wait for or hear about Blink. */
  }
  process.exit(0);
}
