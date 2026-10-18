#!/usr/bin/env node
import { open, readFile } from "node:fs/promises";
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

/** The reply tool, as the terminal names it. */
const REPLY_TOOL = /^mcp__(?:plugin_blinkling_)?blinkling__blinkling_reply$/;

const TRANSCRIPT_TAIL = 2_000_000;
const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((b) => b?.type === "text" && typeof b.text === "string")
          .map((b) => b.text)
          .join("\n")
      : "";
/** What Claude Code said for the prompt typed in the terminal while a question
 * from Blink arrived in the middle of that turn: the text it wrote after the
 * typed prompt and before it answered Blink. The hook hands over only the last
 * message of the turn, which by then is about Blink's question, so the rest is
 * read from the session's transcript. */
export async function typedAnswers(path) {
  if (typeof path !== "string" || !path) return [];
  let rows;
  try {
    const file = await open(path, "r");
    try {
      const { size } = await file.stat();
      const length = Math.min(size, TRANSCRIPT_TAIL);
      const buffer = Buffer.alloc(length);
      await file.read(buffer, 0, length, size - length);
      rows = buffer
        .toString("utf8")
        .split("\n")
        .slice(size > length ? 1 : 0);
    } finally {
      await file.close();
    }
  } catch {
    return [];
  }
  const entries = [];
  for (const row of rows) {
    try {
      entries.push(JSON.parse(row));
    } catch {
      /* A half line at the cut, or one Claude Code is still writing. */
    }
  }
  const typed = (e) => {
    if (e?.type !== "user" || e.isMeta) return false;
    const content = e.message?.content;
    if (
      Array.isArray(content) &&
      content.some((b) => b?.type === "tool_result")
    )
      return false;
    const text = textOf(content);
    return Boolean(text.trim()) && !isChannelPrompt(text) && !isNotice(text);
  };
  const from = entries.findLastIndex(typed);
  if (from < 0) return [];
  const answers = [];
  for (const e of entries.slice(from + 1)) {
    if (e?.type !== "assistant") continue;
    const blocks = Array.isArray(e.message?.content) ? e.message.content : [];
    const text = textOf(blocks).trim();
    if (text) answers.push({ uuid: String(e.uuid ?? ""), text });
    // From the first answer to Blink on, the turn is about Blink's question.
    if (
      blocks.some(
        (b) => b?.type === "tool_use" && /blinkling_reply$/.test(b.name),
      )
    ) {
      answers.replied = true;
      break;
    }
  }
  return answers;
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

/** What was written for the typed prompt of a shared turn goes to the chat. */
async function mirrorTyped(client, session, transcript, last = "") {
  let answers = await typedAnswers(transcript);
  // The last message of a turn can still be on its way to the transcript when
  // the Stop hook runs: wait a moment for it, and use the hook's own copy of
  // it if it does not show up.
  const tail = last.trim().slice(0, 40);
  for (let i = 0; tail && i < 8; i++) {
    if (answers.replied || answers.some((a) => a.text.includes(tail))) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
    answers = await typedAnswers(transcript);
  }
  if (tail && !answers.replied && !answers.some((a) => a.text.includes(tail)))
    answers.push({ uuid: "stop", text: last.trim() });
  for (const answer of answers) {
    await client.rpc("mirror", {
      session,
      role: "assistant",
      id: `${String(session)
        .replace(/[^\w-]/g, "")
        .slice(0, 40)}-assistant-${createHash("sha256")
        .update(answer.uuid + answer.text)
        .digest("hex")
        .slice(0, 16)}`,
      text: answer.text.slice(0, MIRROR_LIMIT),
    });
  }
}

export async function mirror(payload, directory = runtimeDirectory()) {
  const line = mirrorLine(payload);
  const event = payload?.hook_event_name;
  const session = payload?.session_id;
  if (event === "PreToolUse") {
    // The terminal is about to answer Blink in a turn it shares with a typed
    // prompt: what it wrote for the typed prompt came first, so it is shown
    // first, and the answer to Blink follows it.
    if (
      !REPLY_TOOL.test(payload.tool_name ?? "") ||
      typeof session !== "string"
    )
      return false;
    const entry = await opened(directory, session);
    if (entry?.turn !== "mixed") return false;
    const found = await discoverDesktop(join(directory, "desktop.json"), {
      timeoutMs: 1500,
    });
    if (!found) return false;
    await mirrorTyped(found.client, session, payload.transcript_path);
    return true;
  }
  const channelTurn = isChannelPrompt(payload?.prompt);
  // Each prompt says what the turn it starts is. A turn that began as Blink's
  // own channel event is answered in Blink through the reply tool, and one
  // Claude Code started on its own is not Blink's business at all.
  const before =
    event === "UserPromptSubmit" && typeof session === "string"
      ? await opened(directory, session)
      : undefined;
  if (event === "UserPromptSubmit" && typeof session === "string")
    await markTurn(
      directory,
      session,
      channelTurn
        ? // Blink's question that arrives while a typed prompt is still being
          // answered shares its turn: both are answered, and both are shown.
          before?.turn === "typed" || before?.turn === "mixed"
          ? "mixed"
          : "channel"
        : isNotice(payload.prompt)
          ? "notice"
          : "typed",
    ).catch(() => {});
  const started = event === "UserPromptSubmit" && channelTurn;
  const hooked =
    (event === "UserPromptSubmit" || event === "Stop") &&
    typeof session === "string";
  if (!line && !started && !hooked) return false;
  const entry = await opened(directory, line?.session ?? session);
  if (!entry) return false;
  // A turn that ended leaves nothing behind: a question from Blink that comes
  // next starts a turn of its own.
  if (event === "Stop")
    await markTurn(directory, session, "idle").catch(() => {});
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
  if (event === "Stop" && entry.turn === "mixed") {
    // A prompt typed in the terminal and a question from Blink were answered in
    // one turn. What was written for the typed prompt goes to the chat, and
    // the rest ends Blink's turn as it does for a question of its own.
    await mirrorTyped(
      found.client,
      session,
      payload.transcript_path,
      typeof payload.last_assistant_message === "string"
        ? payload.last_assistant_message
        : "",
    );
    await found.client.rpc("turn-end", {
      session,
      shared: true,
      text:
        typeof payload.last_assistant_message === "string"
          ? payload.last_assistant_message
          : "",
    });
    return true;
  }
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
