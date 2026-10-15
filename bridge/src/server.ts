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
  const server = new McpServer({ name: "blinkling", version: "3.1.0" });
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
  server.tool(
    "screen_capture",
    "Capture the screen, a supported window or region, or repeat the last selected region. This runs only when explicitly requested.",
    {
      target: targetSchema,
      long_edge: z.number().int().positive().max(4096).optional(),
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
  server.tool(
    "screen_latest",
    "Return the latest capture with its time, dimensions, source, and PNG image.",
    {},
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
  server.tool(
    "screen_history",
    "List recent capture metadata and notes. History stays in memory and expires after ten minutes.",
    {},
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
  server.tool(
    "screen_watch_start",
    "Explicitly start serial screen watching. Captures only changed frames and retains at most six per minute. No model calls are made.",
    { interval_seconds: z.number().int().min(5).max(60).optional() },
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
  server.tool(
    "screen_watch_stop",
    "Stop explicit screen watching.",
    {},
    async () => {
      await stopCaptures();
      return { content: [{ type: "text", text: "Screen watch stopped." }] };
    },
  );
  server.tool(
    "screen_notes",
    "Add or read the bounded user and assistant narration notes attached to the running screen timeline.",
    {
      action: z.enum(["add", "list"]),
      text: z.string().max(2000).optional(),
      role: z.enum(["user", "assistant"]).optional(),
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
  server.tool(
    "desktop_open",
    "Download, verify and launch Blink on the desktop, or reconnect the running instance. No browser extension is required.",
    {},
    async () => {
      try {
        await launchDesktop();
        return {
          content: [
            { type: "text" as const, text: "Blink is ready on your desktop." },
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
  server.tool(
    "extension_install",
    "Install the optional companion browser extension and open its short guide.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: await helper.openExtensionGuide(),
        },
      ],
    }),
  );
  server.tool(
    "screen_clear",
    "Clear in-memory captures and notes.",
    {},
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
    },
    async close() {
      await stopCaptures();
      await helper.close();
      history.clear();
      await server.close();
    },
  };
}
