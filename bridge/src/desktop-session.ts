import { randomUUID } from "node:crypto";
import {
  discoverDesktop,
  type DesktopClient,
} from "../../plugin/desktop/client.mjs";
import { desktopEnabled } from "../../plugin/desktop/launcher.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { endpointPath, runtimeDirectory } from "../../plugin/desktop/paths.mjs";
import {
  contextPrompt,
  SYSTEM_PROMPT,
  type ProviderRequest,
  type ProviderResult,
} from "./provider-request.js";

export { discoverDesktop };
/** Cheap pre-filter for hot paths: with no endpoint file and no enabled marker
 * there is nothing to ping, so the caller can skip the asynchronous check. */
export function desktopTraces() {
  return (
    existsSync(endpointPath()) ||
    existsSync(join(runtimeDirectory(), "enabled.json"))
  );
}
/** Blink is running only if its endpoint answers a short status ping. The
 * descriptor and the "enabled" marker outlive a crashed or killed Blink, so
 * neither one proves anything; a refused connection also removes the stale file. */
export async function desktopRunning(timeoutMs = 800) {
  return discoverDesktop(endpointPath(), { timeoutMs, removeStale: true });
}
export async function desktopStatePresent() {
  return Boolean(await desktopRunning().catch(() => undefined));
}
/** A previously activated desktop never silently downgrades to local-only AI,
 * but it is given a few seconds to come back (restart, reconnect). A deliberate
 * quit clears the marker, so the extension then answers on its own again. */
export async function desktopConnection(graceMs = 3000) {
  const deadline = Date.now() + graceMs;
  let connected = await desktopRunning();
  if (connected || !(await desktopEnabled())) return connected;
  while (!connected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    connected = await desktopRunning();
  }
  if (!connected)
    throw new Error("Blink is reconnecting. Please try again shortly.");
  return connected;
}
export async function desktopAnswer(
  client: DesktopClient,
  request: ProviderRequest,
): Promise<ProviderResult> {
  if (request.signal.aborted) throw new Error("The answer stopped.");
  const id = randomUUID(),
    controller = new AbortController();
  let answer = "",
    finalAnswer = "",
    admitted = false,
    streamError: Error | undefined;
  let resolveDone!: (value: ProviderResult) => void,
    rejectDone!: (error: Error) => void,
    ready!: () => void;
  const done = new Promise<ProviderResult>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  // Attach a handler immediately; cancellation or a disconnect can precede send.
  void done.catch(() => {});
  const connected = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const abort = () => {
    if (admitted) void client.rpc("stop", { turnId: id }).catch(() => {});
    controller.abort();
    ready();
    rejectDone(new Error("The answer stopped."));
  };
  request.signal.addEventListener("abort", abort, { once: true });
  let started = false;
  const events = client
    .events(
      ({ event }) => {
        if (
          event.type === "message" &&
          event.role === "user" &&
          event.id === id
        )
          started = true;
        if (
          started &&
          event.type === "delta" &&
          typeof event.text === "string"
        ) {
          answer += event.text;
          request.onText(event.text);
        }
        if (
          started &&
          event.type === "message" &&
          event.role === "assistant" &&
          Array.isArray(event.content)
        ) {
          finalAnswer = event.content
            .filter(
              (b): b is { type: string; text: string } =>
                !!b &&
                typeof b === "object" &&
                b.type === "text" &&
                typeof b.text === "string",
            )
            .map((b) => b.text)
            .join("\n");
        }
        if (event.type === "done" && event.turnId === id) {
          const text = finalAnswer || answer;
          if (text.trim()) resolveDone({ answer: text });
          else rejectDone(new Error("The desktop answer was empty."));
        }
      },
      controller.signal,
      0,
      ready,
    )
    .catch((error: unknown) => {
      if (!controller.signal.aborted) {
        streamError =
          error instanceof Error ? error : new Error("Blink is reconnecting.");
        ready();
        rejectDone(streamError);
      }
    });
  try {
    await connected;
    if (streamError) throw streamError;
    if (controller.signal.aborted) throw new Error("The answer stopped.");
    admitted = true;
    await client.rpc(
      "send",
      {
        selection: { model: request.model, effort: request.effort || "medium" },
        turn: {
          id,
          source: "companion",
          text: `${SYSTEM_PROMPT} Never click, type, or control another app; explain only and do not use computer control or edit tools.\n${contextPrompt(request)}`,
          attachments: request.image
            ? [
                {
                  id: randomUUID(),
                  name: "Screenshot.png",
                  mediaType: "image/png",
                  data: request.image.toString("base64"),
                },
              ]
            : [],
        },
      },
      request.signal,
    );
    return await done;
  } finally {
    request.signal.removeEventListener("abort", abort);
    controller.abort();
    await events;
  }
}
export async function runDesktopProvider(request: ProviderRequest) {
  const desktop = await desktopConnection();
  if (!desktop) return undefined;
  return desktopAnswer(desktop.client, request);
}
