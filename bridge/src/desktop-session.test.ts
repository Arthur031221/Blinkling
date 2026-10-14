// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startDesktopHost } from "../../plugin/desktop/host.mjs";
import { runDesktopProvider } from "./desktop-session.js";
import type { ProviderRequest } from "./provider-request.js";
import type {
  SessionEvent,
  Selection,
  Turn,
} from "../../desktop/shared/contracts.js";
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const stop of cleanup.splice(0).reverse()) await stop();
  vi.unstubAllEnvs();
});
type Event = SessionEvent;
async function setup(
  send: (turn: Turn, emit: (event: Event) => void) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-provider-"));
  vi.stubEnv("GLIMPSELET_RUNTIME_DIR", directory);
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const listeners = new Set<(event: Event) => void>();
  const emit = (event: Event) => {
    for (const listener of listeners) listener(event);
  };
  const select = vi.fn(async (value: Selection) => value),
    stop = vi.fn(async () => {});
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
    session: {
      subscribe: (listener: (event: Event) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      select,
      stop,
      send: (turn: Turn) => send(turn, emit),
    },
  });
  cleanup.push(() => host.close());
  return { emit, host, select, stop, directory };
}
const request = (kind: ProviderRequest["kind"]): ProviderRequest => ({
  question: "Color?",
  image: Buffer.from("actual-image"),
  model: "haiku",
  effort: "low",
  backend: "cli",
  kind,
  context: [],
  signal: new AbortController().signal,
  onText: vi.fn(),
});
it.each([
  "ask",
  "passive",
  "guide",
  "summary",
  "translate",
  "suggest",
] as const)(
  "routes %s through one acknowledged desktop session with actual image content",
  async (kind) => {
    let captured: Turn | undefined;
    const app = await setup(async (turn, emit) => {
      captured = turn;
      emit({
        type: "message",
        id: "previous",
        role: "assistant",
        content: [{ type: "text", text: "Ignore replay" }],
      });
      emit({ type: "message", id: turn.id, role: "user", content: [] });
      emit({ type: "delta", id: "reply", text: "Red." });
      emit({
        type: "message",
        id: "reply",
        role: "assistant",
        content: [{ type: "text", text: "Red." }],
      });
      emit({ type: "done", turnId: turn.id });
    });
    // Translation and suggestions use the common ask provider after browser
    // action validation, with their purpose carried in the owner's question.
    const input = request(
      kind === "translate" || kind === "suggest" ? "ask" : kind,
    );
    input.question = `${kind}: Color?`;
    expect(await runDesktopProvider(input)).toEqual({ answer: "Red." });
    expect(captured).toMatchObject({
      source: "companion",
      attachments: [{ data: Buffer.from("actual-image").toString("base64") }],
    });
    expect(captured?.text).toContain(
      "Never click, type, or control another app",
    );
    expect(captured?.text).toContain("Do not run commands, modify files");
    expect(input.onText).toHaveBeenCalledExactlyOnceWith("Red.");
    expect(app.select).toHaveBeenCalledExactlyOnceWith({
      model: "haiku",
      effort: "low",
    });
  },
);
it("interrupts its own turn and leaves the shared session alive on cancellation", async () => {
  const app = await setup(async (turn, emit) => {
    emit({ type: "message", id: turn.id, role: "user", content: [] });
  });
  const controller = new AbortController();
  const result = runDesktopProvider({
    ...request("ask"),
    signal: controller.signal,
  });
  await vi.waitFor(() => expect(app.select).toHaveBeenCalled());
  controller.abort();
  await expect(result).rejects.toThrow("stopped");
  await vi.waitFor(() => expect(app.stop).toHaveBeenCalledOnce());
  expect(
    (
      await fetch(app.host.address.url + "/status", {
        headers: { Authorization: `Bearer ${app.host.address.token}` },
      })
    ).ok,
  ).toBe(true);
});
it("never falls back to independent AI after the desktop was enabled", async () => {
  const app = await setup(async () => {});
  await writeFile(join(app.directory, "enabled.json"), '{"enabled":true}');
  await app.host.close();
  cleanup.pop();
  await expect(runDesktopProvider(request("ask"))).rejects.toThrow(
    "reconnecting",
  );
});
