#!/usr/bin/env node
import { fileURLToPath } from "node:url";

/** The reply tool's own name as the terminal sees it. */
export const REPLY_TOOL = "mcp__plugin_blinkling_blinkling__blinkling_reply";

/** The hook output after the reply tool has delivered an answer: the turn ends
 * there, so the terminal adds no line about what Blink was told. A failed call
 * is left to the model, which has to say what went wrong. */
export function quiet(payload) {
  if (payload?.tool_name !== REPLY_TOOL) return undefined;
  const response = payload.tool_response;
  if (response?.isError === true || response?.is_error === true)
    return undefined;
  return { continue: false, suppressOutput: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { hookPayload } = await import("./sessions.mjs");
  try {
    const out = quiet(await hookPayload());
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    /* The terminal must never wait for or hear about Blink. */
  }
  process.exit(0);
}
