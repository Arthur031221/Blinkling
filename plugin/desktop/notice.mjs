#!/usr/bin/env node
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { hookPayload } = await import("./sessions.mjs");
  try {
    const out = await notice(await hookPayload());
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    /* The terminal must never wait for or hear about Blink. */
  }
  process.exit(0);
}
