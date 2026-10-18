import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverDesktop } from "../../plugin/desktop/client.mjs";

/** What Claude Code is told about the channel. A session started with the
 * channel flag answers the chat held in Blink itself, through the reply tool;
 * the person reads the answer in Blink. */
export const SYNC_INSTRUCTIONS =
  'Only when events from the blinkling channel arrive: each one is a message the person typed in Blink, the desktop companion, and the person reads your answer in Blink, not here. Answer it by calling the blinkling_reply tool once, with the answer as plain text and the turn value of the event as turn, and write nothing else in this terminal: no sentence before the call, and after the tool returns stop at once, with no summary, no confirmation and no closing remark, because nobody reads this terminal for the answer. If the event has a pictures attribute, call blinkling_chat_images first and look at them; a files attribute names files attached in Blink. An event with kind="notice" is a short fact, such as Blink having been closed: tell the person in one short line and call no tool.';

/** What the person types to start Claude Code so Blink's chat reaches it.
 * Claude Code takes a channel only when it starts, so a session already open
 * cannot. */
export const SYNC_COMMAND =
  "claude --dangerously-load-development-channels plugin:blinkling@blinkling";
/** The line the open tool adds, by whether this session took the channel. */
export const syncNote = (channel: boolean) =>
  channel
    ? "Say this once in your reply, as plain text with no label: this session answers the chat you hold in Blink, and what you type here appears there."
    : `Say this once in your reply, as plain text with no label: what you type and read in this terminal already appears in Blink, and Blink answers its own chat from its own session. To let this session answer Blink's chat itself, start Claude Code with the command on its own line: ${SYNC_COMMAND}`;
export const SYNC_NOTE = syncNote(false);

const RETRY_MS = 4000;

/** Whether a command line is Claude Code started with the Blinkling channel.
 * Only the development flag counts: the plain `--channels` flag takes only
 * allowlisted channels, and Claude Code 2.1.301 answers this plugin with "not
 * on the approved channels allowlist", so a session started that way would
 * never receive a message from Blink. */
export function channelFlagged(commandLine: string): boolean {
  const words = commandLine.split(/[\s\0]+/);
  return words.some(
    (word, i) =>
      word === "--dangerously-load-development-channels" &&
      words.slice(i + 1, i + 8).some((w) => /(^|:)blinkling(@|$)/.test(w)),
  );
}

/** The command line of a process, or "" when it cannot be read. */
export function commandLineOf(pid: number): string {
  try {
    if (process.platform === "linux")
      return readFileSync(`/proc/${pid}/cmdline`, "utf8");
    if (process.platform === "win32")
      return (
        spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
          ],
          { encoding: "utf8", timeout: 4000, windowsHide: true },
        ).stdout ?? ""
      );
    return (
      spawnSync("ps", ["-o", "command=", "-p", String(pid)], {
        encoding: "utf8",
        timeout: 2000,
      }).stdout ?? ""
    );
  } catch {
    return "";
  }
}

export type SyncIdentity = {
  session: string;
  pid: number;
  cwd: string;
  channel: boolean;
};

/** Which Claude Code session loaded this server, as the plugin host and the
 * hooks name it. */
export function syncIdentity(
  env: NodeJS.ProcessEnv = process.env,
  ppid = process.ppid,
  readCommand: (pid: number) => string = commandLineOf,
): SyncIdentity {
  // The parent is Claude Code itself. CLAUDE_PID is not read: a Claude Code
  // started inside another one inherits the outer one's value.
  const pid = ppid;
  const session = (env.CLAUDE_CODE_SESSION_ID ?? "").replace(/[^\w-]/g, "");
  return {
    session: session || `pid-${pid}`,
    pid,
    cwd: env.CLAUDE_PROJECT_DIR || process.cwd(),
    channel: channelFlagged(readCommand(pid)),
  };
}

type Frame = {
  type?: string;
  turn?: string;
  text?: string;
  pictures?: number;
  files?: string[];
};

/** The channel notification for one frame from Blink. */
export function channelNotification(frame: Frame) {
  const pictures = Math.max(0, Math.min(99, Number(frame.pictures) || 0));
  // A message of pictures alone still needs a body for the event.
  const text = String(frame.text ?? "").trim() || (pictures ? "(picture)" : "");
  if (!text) return undefined;
  if (frame.type === "notice")
    return { content: text, meta: { kind: "notice" } };
  if (frame.type === "turn")
    return {
      content: text,
      meta: {
        kind: "question",
        reply:
          "Answer with the blinkling_reply tool, then end the turn without writing any text.",
        turn: String(frame.turn ?? "").replace(/[^\w-]/g, ""),
        ...(pictures ? { pictures: String(pictures) } : {}),
        ...(Array.isArray(frame.files) && frame.files.length
          ? { files: frame.files.slice(0, 8).join(", ") }
          : {}),
      },
    };
  return undefined;
}

/** Keeps this session linked to Blink: it holds one line open, so Blink knows
 * the session is alive and whether it answers by channel, and what Blink sends
 * arrives as channel events. Without the startup flag Claude Code drops the
 * events, so Blink is told not to send any. Returns the controls. */
export function startSyncChannel(
  server: McpServer,
  {
    retryMs = RETRY_MS,
    discover = discoverDesktop,
    identity = syncIdentity(),
  }: {
    retryMs?: number;
    discover?: typeof discoverDesktop;
    identity?: SyncIdentity;
  } = {},
) {
  const stop = new AbortController();
  void (async () => {
    while (!stop.signal.aborted) {
      try {
        const found = await discover(undefined, { timeoutMs: 1500 });
        if (found)
          await found.client.link(
            {
              session: identity.session,
              pid: identity.pid,
              cwd: identity.cwd,
              channel: identity.channel ? 1 : 0,
            },
            (frame: Frame) => {
              const note = channelNotification(frame);
              if (note)
                void server.server
                  .notification({
                    method: "notifications/claude/channel",
                    params: note,
                  })
                  .catch(() => undefined);
            },
            stop.signal,
          );
      } catch {
        /* Blink is not running or went away: look again shortly. */
      }
      await new Promise((r) => setTimeout(r, retryMs).unref?.());
    }
  })();
  const call = async (method: string, value: Record<string, unknown>) => {
    const found = await discover(undefined, { timeoutMs: 1500 });
    if (!found) throw new Error("Blink is not running.");
    return (await found.client.rpc(method, {
      session: identity.session,
      ...value,
    })) as Record<string, unknown>;
  };
  return {
    identity,
    stop: () => stop.abort(),
    /** The answer to a chat held in Blink. */
    reply: (text: string, turn?: string) =>
      call("reply", { text, ...(turn ? { turn } : {}) }),
    /** The pictures of the chat's latest question. */
    images: async () =>
      ((await call("chat-images", {})).images ?? []) as {
        mediaType: string;
        data: string;
      }[],
  };
}
