import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverDesktop } from "../../plugin/desktop/client.mjs";

/** What Claude Code is told about the channel. Blink answers its own chat, so
 * these events only keep this session informed. */
export const SYNC_INSTRUCTIONS =
  'Events from the blinkling channel mirror a chat held in Blink, the desktop companion. role="user" is what the person typed there, role="assistant" is the answer Blink gave. They are informational: do not reply to them, do not run tools because of them, and end the turn without text. Use them only as context if the person asks about that chat.';

/** What the person types to see Blink's chat in the terminal too. Claude Code
 * takes a channel only when it starts, so a session already open cannot. */
export const SYNC_COMMAND =
  "claude --dangerously-load-development-channels plugin:blinkling@blinkling";
export const SYNC_NOTE = `Sync line: what you type and read in this terminal already appears in Blink. To see Blink's chat here too, start Claude Code with: ${SYNC_COMMAND}`;

const LIMIT = 8000;
const RETRY_MS = 4000;

type Block = { type?: string; text?: string };
type Line = { id: string; role: "user" | "assistant"; text: string };
export type SyncEvent = {
  type?: string;
  id?: string;
  role?: string;
  origin?: string;
  turnId?: string;
  content?: Block[];
};

/** The text of a chat message; a picture is named, not sent. */
export function textOf(content: Block[] | undefined): string {
  return (content ?? [])
    .map((block) =>
      block.type === "text"
        ? (block.text ?? "")
        : block.type === "image"
          ? "[picture]"
          : "",
    )
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, LIMIT);
}

/** Turns Blink's stream of chat events into the lines to mirror: what was
 * typed at once, and an answer when it is done. Lines that came from the
 * terminal are never sent back. */
export function mirrorLines() {
  const answers = new Map<string, string>();
  const sent = new Set<string>();
  return (event: SyncEvent): Line[] => {
    if (event.type === "message" && event.id && event.origin !== "terminal") {
      const text = textOf(event.content);
      if (!text) return [];
      if (event.role === "assistant") {
        answers.set(event.id, text);
        return [];
      }
      if (event.role === "user" && !sent.has(event.id)) {
        sent.add(event.id);
        return [{ id: event.id, role: "user", text }];
      }
      return [];
    }
    if (event.type === "done") {
      const lines = [...answers].map(([id, text]) => ({
        id,
        role: "assistant" as const,
        text,
      }));
      answers.clear();
      return lines;
    }
    return [];
  };
}

/** Keeps pushing Blink's chat into the Claude Code session that loaded this
 * server as a channel. Without the startup flag Claude Code drops the events,
 * so this is harmless in any other session. Returns a stop function. */
export function startSyncChannel(
  server: McpServer,
  { retryMs = RETRY_MS, discover = discoverDesktop } = {},
) {
  const stop = new AbortController();
  void (async () => {
    while (!stop.signal.aborted) {
      try {
        const found = await discover(undefined, { timeoutMs: 1500 });
        if (found) {
          const lines = mirrorLines();
          // After a number no frame has yet: only what happens from now on,
          // never the history Blink replays when it reconnects.
          await found.client.events(
            (frame: { event: SyncEvent }) => {
              for (const line of lines(frame.event))
                void server.server
                  .notification({
                    method: "notifications/claude/channel",
                    params: {
                      content: line.text,
                      meta: {
                        role: line.role,
                        chat_id: line.id.replace(/\W/g, "_"),
                      },
                    },
                  })
                  .catch(() => undefined);
            },
            stop.signal,
            Number.MAX_SAFE_INTEGER,
          );
        }
      } catch {
        /* Blink is not running or went away: look again shortly. */
      }
      await new Promise((r) => setTimeout(r, retryMs).unref?.());
    }
  })();
  return () => stop.abort();
}
