#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { discoverDesktop } from "./client.mjs";
import { runtimeDirectory } from "./paths.mjs";
import { MIRROR_LIMIT } from "./host.mjs";
import { markTurn } from "./sessions.mjs";

/** A prompt that is Blink's own chat coming back as a channel event. An
 * installed plugin's events carry source="plugin:blinkling:blinkling"; a
 * server added by hand carries the bare name. */
export const isChannelPrompt = (text) =>
  typeof text === "string" &&
  /^\s*<channel\s+source="(?:plugin:blinkling:|)blinkling"/.test(text);

/** A prompt Claude Code made itself: a finished background task, a reminder, or
 * the echo of a slash command. The person did not type it, so it never reaches
 * Blink's chat, and neither does the answer to it. */
export const isNotice = (text) =>
  typeof text === "string" &&
  /^\s*<(?:task-notification|system-reminder|local-command-[\w-]+|command-(?:name|message|args)|bash-(?:input|stdout|stderr))\b/.test(
    text,
  );

/** Claude Code hands a hook a long paste in its expanded form, wrapped in a
 * `<pasted_content id="...">` tag. The words inside are what the person pasted,
 * so they stay, with their line breaks, and the tag goes. */
export const unwrapPasted = (text) =>
  text.replace(
    /<pasted_content\b[^>]*>\s*?\n?([\s\S]*?)\n?\s*<\/pasted_content\b[^>]*>/gi,
    "$1",
  );

/** Claude Code stands in for a pasted picture or a long paste with a marker in
 * the prompt, such as `[Image #1]` or `[Pasted text #2 +40 lines]`. Blink's chat
 * cannot show what the marker stands for, so a mirrored prompt keeps the words
 * the person typed and drops the markers. */
export const withoutMarkers = (text) =>
  unwrapPasted(text)
    .replace(
      /\[(?:Image|Pasted text|Pasted image|Image\/PDF)\s*#\d+[^\]\n]*\]/gi,
      "",
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** What a terminal turn adds to Blink's chat, from a hook payload: the prompt
 * typed, or the answer Claude Code just finished. Nothing for other events. */
export function mirrorLine(payload) {
  const event = payload?.hook_event_name;
  const [role, text] =
    event === "UserPromptSubmit"
      ? [
          "user",
          typeof payload.prompt === "string"
            ? withoutMarkers(payload.prompt)
            : payload.prompt,
        ]
      : event === "Stop"
        ? ["assistant", payload.last_assistant_message]
        : [];
  if (!role || typeof text !== "string" || !text.trim()) return undefined;
  // Blink's own chat reaches the terminal as a channel event, which the prompt
  // hook sees as a prompt; sending it on would show every line twice.
  if (role === "user" && isChannelPrompt(text)) return undefined;
  if (role === "user" && isNotice(payload.prompt)) return undefined;
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

/** The entry of a session that opened Blink, or nothing: no other terminal's
 * text ever reaches the screen. */
export async function opened(directory, session) {
  try {
    const list = JSON.parse(
      await readFile(join(directory, "sessions.json"), "utf8"),
    );
    return (
      (Array.isArray(list) && list.find((e) => e?.id === session)) || undefined
    );
  } catch {
    return undefined;
  }
}
export const mirrors = async (directory, session) =>
  Boolean(await opened(directory, session));

export async function mirror(payload, directory = runtimeDirectory()) {
  const line = mirrorLine(payload);
  const event = payload?.hook_event_name;
  const session = payload?.session_id;
  const channelTurn = isChannelPrompt(payload?.prompt);
  // Each prompt says what the turn it starts is. A turn that began as Blink's
  // own channel event is answered in Blink through the reply tool, and one
  // Claude Code started on its own is not Blink's business at all.
  if (event === "UserPromptSubmit" && typeof session === "string")
    await markTurn(
      directory,
      session,
      channelTurn ? "channel" : isNotice(payload.prompt) ? "notice" : "typed",
    ).catch(() => {});
  const started = event === "UserPromptSubmit" && channelTurn;
  const hooked =
    (event === "UserPromptSubmit" || event === "Stop") &&
    typeof session === "string";
  if (!line && !started && !hooked) return false;
  const entry = await opened(directory, line?.session ?? session);
  if (!entry) return false;
  const found = await discoverDesktop(join(directory, "desktop.json"), {
    timeoutMs: 1500,
  });
  if (!found) return false;
  // A turn running or done tells Blink whether the terminal can take a question
  // now. An older Blink that does not know the word is not a reason to stop.
  if (hooked)
    await found.client
      .rpc("busy", { session, busy: event === "UserPromptSubmit" })
      .catch(() => {});
  if (started) {
    // The terminal took Blink's question and began on it. Blink stops waiting
    // to hear that it arrived.
    await found.client.rpc("turn-start", { session });
    return true;
  }
  if (event === "Stop" && entry.turn === "notice") return false;
  if (event === "Stop" && entry.turn === "channel") {
    // The terminal's turn for a chat in Blink ended. If the answer came as
    // plain text and not through the reply tool, Blink shows it from here.
    await found.client.rpc("turn-end", {
      session,
      text:
        typeof payload.last_assistant_message === "string"
          ? payload.last_assistant_message
          : "",
    });
    return true;
  }
  if (!line) return false;
  await found.client.rpc("mirror", {
    session: line.session,
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
