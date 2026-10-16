#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { discoverDesktop } from "./client.mjs";
import { runtimeDirectory } from "./paths.mjs";
import { MIRROR_LIMIT } from "./host.mjs";

/** What a terminal turn adds to Blink's chat, from a hook payload: the prompt
 * typed, or the answer Claude Code just finished. Nothing for other events. */
export function mirrorLine(payload) {
  const event = payload?.hook_event_name;
  const [role, text] =
    event === "UserPromptSubmit"
      ? ["user", payload.prompt]
      : event === "Stop"
        ? ["assistant", payload.last_assistant_message]
        : [];
  if (!role || typeof text !== "string" || !text.trim()) return undefined;
  // Blink's own chat reaches the terminal as a channel event, which the prompt
  // hook sees as a prompt; sending it on would show every line twice.
  if (role === "user" && /^\s*<channel source="blinkling"/.test(text))
    return undefined;
  const session = String(payload.session_id ?? "").replace(/[^\w-]/g, "");
  if (!session) return undefined;
  const id = `${session.slice(0, 40)}-${role}-${createHash("sha256")
    .update(String(payload.prompt_id ?? "") + text)
    .digest("hex")
    .slice(0, 16)}`;
  return {
    session: payload.session_id,
    role,
    id,
    text: text.slice(0, MIRROR_LIMIT),
  };
}

/** Only a session that opened Blink is mirrored, so no other terminal's text
 * ever reaches the screen. */
export async function mirrors(directory, session) {
  try {
    const list = JSON.parse(
      await readFile(join(directory, "sessions.json"), "utf8"),
    );
    return Array.isArray(list) && list.some((e) => e?.id === session);
  } catch {
    return false;
  }
}

export async function mirror(payload, directory = runtimeDirectory()) {
  const line = mirrorLine(payload);
  if (!line || !(await mirrors(directory, line.session))) return false;
  const found = await discoverDesktop(join(directory, "desktop.json"), {
    timeoutMs: 1500,
  });
  if (!found) return false;
  await found.client.rpc("mirror", {
    role: line.role,
    id: line.id,
    text: line.text,
  });
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { hookPayload } = await import("./sessions.mjs");
  try {
    await mirror(await hookPayload());
  } catch {
    /* The terminal must never wait for or hear about Blink. */
  }
  process.exit(0);
}
