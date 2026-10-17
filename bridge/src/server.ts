import { launchDesktop } from "../../plugin/desktop/launcher.mjs";
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createNativeAdapter,
  type CaptureAdapter,
  type Target,
} from "./capture.js";
import { CaptureHistory, type Capture } from "./history.js";
import {
  DEFAULT_LONG_EDGE,
  WATCH_LIMIT_PER_MINUTE,
  positiveInteger,
} from "./config.js";
import { normalizePng } from "./png.js";
import { HelperServer } from "./helper-server.js";
import { SlidingWindowLimiter } from "./limiter.js";
import { cancelled } from "./errors.js";
import {
  SYNC_INSTRUCTIONS,
  syncIdentity,
  syncNote,
  startSyncChannel,
} from "./sync-channel.js";

type ServerOptions = {
  adapter?: CaptureAdapter;
  history?: CaptureHistory;
  fixturePath?: string;
};
const targetSchema = z.enum(["screen", "window", "region", "last_selection"]);

export async function createBlinkling(options: ServerOptions = {}) {
  const history = options.history ?? new CaptureHistory();
  let adapter = options.adapter;
  const getAdapter = async () => {
    adapter ??= await createNativeAdapter();
    return adapter;
  };
  let onClear = async () => {};
  const helper = await new HelperServer({
    onClear: () => onClear(),
  }).start();
  const server = new McpServer(
    { name: "blinkling", version: "3.2.4" },
    {
      capabilities: { experimental: { "claude/channel": {} } },
      instructions: SYNC_INSTRUCTIONS,
    },
  );
  let sync: ReturnType<typeof startSyncChannel> | undefined;
  let who: ReturnType<typeof syncIdentity> | undefined;
  /** Which Claude Code session loaded this server; read once, when first needed. */
  const identity = () => (who ??= syncIdentity());
  let watchTimer: NodeJS.Timeout | undefined;
  let watching = false,
    inCapture = false;
  const watchLimiter = new SlidingWindowLimiter(WATCH_LIMIT_PER_MINUTE, 60_000);
  let watchSignature: string | undefined;
  let generation = 0;
  const captures = new Map<AbortController, Promise<Capture>>();
  const stopCaptures = async () => {
    watching = false;
    generation++;
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = undefined;
    for (const controller of captures.keys()) controller.abort();
    await Promise.allSettled([...captures.values()]);
  };
  onClear = stopCaptures;

  const performCapture = async (
    target: Target,
    longEdge: number,
    retain: boolean,
    signal: AbortSignal,
    captureGeneration: number,
  ): Promise<Capture> => {
    const check = () => {
      if (signal.aborted || generation !== captureGeneration) throw cancelled();
    };
    check();
    if (options.fixturePath) {
      if (process.env.BLINKLING_TEST_MODE !== "1")
        throw new Error("Fixtures require BLINKLING_TEST_MODE=1.");
      const normalized = normalizePng(
        await readFile(options.fixturePath),
        longEdge,
      );
      check();
      const item = {
        ...normalized,
        at: Date.now(),
        source: "test fixture",
        note: "",
      };
      if (retain) history.add(item);
      return item;
    }
    const native = await getAdapter();
    check();
    if (!native.supported[target])
      throw new Error(
        `Capture target '${target}' is unsupported here. Supported targets: ${Object.entries(
          native.supported,
        )
          .filter(([, supported]) => supported)
          .map(([name]) => name)
          .join(", ")}.`,
      );
    const result = await native.capture(target, signal);
    check();
    const normalized = normalizePng(result.image, longEdge);
    const item = {
      ...normalized,
      at: Date.now(),
      source: result.source,
      note: "",
    };
    if (retain) history.add(item);
    return item;
  };
  const capture = (
    target: Target,
    longEdge: number,
    retain = true,
    signal?: AbortSignal,
  ): Promise<Capture> => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", cancel, { once: true });
    const task = performCapture(
      target,
      longEdge,
      retain,
      controller.signal,
      generation,
    );
    captures.set(controller, task);
    void task
      .finally(() => {
        captures.delete(controller);
        signal?.removeEventListener("abort", cancel);
      })
      .catch(() => {});
    return task;
  };
  const imageResult = (item: Capture, prefix = "") => ({
    content: [
      {
        type: "text" as const,
        text: `${prefix}Captured ${new Date(item.at).toISOString()} · ${item.width}×${item.height} · ${item.source}`,
      },
      {
        type: "image" as const,
        data: item.image.toString("base64"),
        mimeType: "image/png" as const,
      },
    ],
  });
  server.registerTool(
    "screen_capture",
    {
      title: "Capture the screen",
      description:
        "Capture the screen, a supported window or region, or repeat the last selected region. This runs only when explicitly requested.",
      inputSchema: {
        target: targetSchema,
        long_edge: z.number().int().positive().max(4096).optional(),
      },
      annotations: {
        title: "Capture the screen",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ target, long_edge }, extra) =>
      imageResult(
        await capture(
          target,
          positiveInteger(long_edge, DEFAULT_LONG_EDGE, 4096),
          true,
          extra.signal,
        ),
      ),
  );
  server.registerTool(
    "screen_latest",
    {
      title: "Show the latest capture",
      description:
        "Return the latest capture with its time, dimensions, source, and PNG image.",
      inputSchema: {},
      annotations: {
        title: "Show the latest capture",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const item = history.latest();
      return item
        ? imageResult(item)
        : {
            content: [
              {
                type: "text",
                text: "No capture is available. Check the screen recording permission, then try again.",
              },
            ],
          };
    },
  );
  server.registerTool(
    "screen_history",
    {
      title: "List recent captures",
      description:
        "List recent capture metadata and notes. History stays in memory and expires after ten minutes.",
      inputSchema: {},
      annotations: {
        title: "List recent captures",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [
        {
          type: "text",
          text:
            history
              .all()
              .map(
                (entry, i) =>
                  `${i + 1}. ${new Date(entry.at).toISOString()} · ${entry.width}×${entry.height} · ${entry.source}${entry.note ? ` · ${entry.note}` : ""}`,
              )
              .join("\n") || "No recent captures.",
        },
      ],
    }),
  );
  server.registerTool(
    "screen_watch_start",
    {
      title: "Start screen watching",
      description:
        "Explicitly start serial screen watching. Captures only changed frames and retains at most six per minute. No model calls are made.",
      inputSchema: {
        interval_seconds: z.number().int().min(5).max(60).optional(),
      },
      annotations: {
        title: "Start screen watching",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ interval_seconds }, extra) => {
      if (watching)
        return {
          content: [{ type: "text", text: "Screen watch is already running." }],
        };
      const watchGeneration = generation;
      watching = true;
      try {
        const available =
          options.fixturePath || (await getAdapter()).supported.screen;
        if (extra.signal.aborted || watchGeneration !== generation)
          throw cancelled();
        if (!available) {
          watching = false;
          return {
            content: [
              {
                type: "text",
                text: "Native screen capture is unavailable here. Check the screen recording permission.",
              },
            ],
            isError: true,
          };
        }
      } catch (error) {
        if (watchGeneration === generation) watching = false;
        throw error;
      }
      watchSignature = undefined;
      watchTimer = setInterval(
        async () => {
          if (!watching || inCapture) return;
          inCapture = true;
          try {
            const item = await capture("screen", DEFAULT_LONG_EDGE, false);
            if (!watching || watchGeneration !== generation) return;
            if (item.signature !== watchSignature && watchLimiter.take()) {
              history.add(item);
              watchSignature = item.signature;
            }
          } catch {
            // A failed frame is skipped; the next interval tries again.
          } finally {
            inCapture = false;
          }
        },
        (interval_seconds ?? 10) * 1000,
      );
      watchTimer.unref();
      return {
        content: [
          {
            type: "text",
            text: `Screen watch started at ${interval_seconds ?? 10}s intervals. It retains changed frames only, up to ${WATCH_LIMIT_PER_MINUTE} per minute; no model is called.`,
          },
        ],
      };
    },
  );
  server.registerTool(
    "screen_watch_stop",
    {
      title: "Stop screen watching",
      description: "Stop explicit screen watching.",
      inputSchema: {},
      annotations: {
        title: "Stop screen watching",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      await stopCaptures();
      return { content: [{ type: "text", text: "Screen watch stopped." }] };
    },
  );
  server.registerTool(
    "screen_notes",
    {
      title: "Add or read notes",
      description:
        "Add or read the bounded user and assistant narration notes attached to the running screen timeline.",
      inputSchema: {
        action: z.enum(["add", "list"]),
        text: z.string().max(2000).optional(),
        role: z.enum(["user", "assistant"]).optional(),
      },
      annotations: {
        title: "Add or read notes",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ action, text, role }) => {
      if (action === "add") {
        if (!text?.trim())
          return {
            content: [
              {
                type: "text",
                text: "A non-empty text value is required when adding a note.",
              },
            ],
            isError: true,
          };
        history.addNote(text.trim(), role ?? "user");
      }
      return {
        content: [
          {
            type: "text",
            text:
              history
                .allNotes()
                .map(
                  (note) =>
                    `${new Date(note.at).toISOString()} [${note.role}] ${note.text}`,
                )
                .join("\n") || "No notes yet.",
          },
        ],
      };
    },
  );
  server.registerTool(
    "desktop_open",
    {
      title: "Open Blink on the desktop",
      description:
        "Download, verify and launch Blink on the desktop, or reconnect the running instance. No browser extension is required.",
      inputSchema: {},
      annotations: {
        title: "Open Blink on the desktop",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        await launchDesktop({ session: identity().session });
        return {
          content: [
            { type: "text" as const, text: "Blink is ready on your desktop." },
            { type: "text" as const, text: syncNote(identity().channel) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error
                  ? error.message
                  : "Blink could not start.",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "blinkling_reply",
    {
      title: "Answer the chat held in Blink",
      description:
        "Send the answer to a message the person typed in Blink. Only for events that arrive from the blinkling channel. The answer shows in Blink's chat as the assistant's.",
      inputSchema: {
        text: z.string().min(1).max(20_000),
        turn: z.string().max(100).optional(),
      },
      annotations: {
        title: "Answer the chat held in Blink",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ text, turn }) => {
      try {
        if (!sync) throw new Error("Blink is not linked to this session.");
        if (!identity().channel)
          throw new Error(
            "This session was not started with the channel flag, so Blink answers its own chat.",
          );
        const result = await sync.reply(text, turn);
        if (result.late === true)
          return {
            content: [
              {
                type: "text" as const,
                text: "Blink already answered this question itself. Nothing more is needed; say nothing.",
              },
            ],
          };
        if (result.ok !== true)
          throw new Error("Blink had no open question for this session.");
        return { content: [{ type: "text" as const, text: "Sent to Blink." }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error
                  ? error.message
                  : "Blink is not reachable.",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "blinkling_chat_images",
    {
      title: "Look at the pictures in Blink's chat",
      description:
        "Return the pictures attached to the latest message the person typed in Blink, as images. Call it when a channel event has a pictures attribute.",
      inputSchema: {},
      annotations: {
        title: "Look at the pictures in Blink's chat",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        if (!sync) throw new Error("Blink is not linked to this session.");
        const images = await sync.images();
        if (!images.length)
          return {
            content: [
              { type: "text" as const, text: "No pictures are attached." },
            ],
          };
        return {
          content: images.map((image) => ({
            type: "image" as const,
            data: image.data,
            mimeType: image.mediaType,
          })),
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error
                  ? error.message
                  : "Blink is not reachable.",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "extension_install",
    {
      title: "Install the browser extension",
      description:
        "Install the optional companion browser extension and open its short guide.",
      inputSchema: {},
      annotations: {
        title: "Install the browser extension",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: await helper.openExtensionGuide(),
        },
      ],
    }),
  );
  server.registerTool(
    "screen_clear",
    {
      title: "Clear captures and notes",
      description: "Clear in-memory captures and notes.",
      inputSchema: {},
      annotations: {
        title: "Clear captures and notes",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      await stopCaptures();
      await helper.clearAll();
      history.clear();
      return {
        content: [{ type: "text", text: "Capture history and notes cleared." }],
      };
    },
  );
  return {
    server,
    history,
    helper,
    async connect() {
      await server.connect(new StdioServerTransport());
      sync = startSyncChannel(server, { identity: identity() });
    },
    async close() {
      sync?.stop();
      await stopCaptures();
      await helper.close();
      history.clear();
      await server.close();
    },
  };
}
