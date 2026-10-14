// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startDesktopHost } from "../../plugin/desktop/host.mjs";
import {
  desktopRunning,
  desktopStatePresent,
  runDesktopProvider,
} from "./desktop-session.js";
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
  vi.stubEnv("BLINKLING_RUNTIME_DIR", directory);
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

async function plant(directory: string, port: number) {
  await writeFile(
    join(directory, "desktop.json"),
    JSON.stringify({
      url: `http://127.0.0.1:${port}`,
      token: "a".repeat(64),
      pid: 1,
      version: "test",
    }),
    { mode: 0o600 },
  );
}
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
async function closedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
it("reports a running desktop only after a live status ping", async () => {
  await setup(async () => {});
  expect((await desktopRunning())?.status).toMatchObject({ pid: process.pid });
  expect(await desktopStatePresent()).toBe(true);
});
it("ignores and removes a stale endpoint left by a Blink that quit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-stale-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  vi.stubEnv("BLINKLING_RUNTIME_DIR", directory);
  await plant(directory, await closedPort());
  expect(await desktopRunning()).toBeUndefined();
  expect(await exists(join(directory, "desktop.json"))).toBe(false);
  expect(await desktopStatePresent()).toBe(false);
});
it("does not treat the enabled marker alone as a running desktop", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-enabled-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  vi.stubEnv("BLINKLING_RUNTIME_DIR", directory);
  await writeFile(join(directory, "enabled.json"), '{"enabled":true}');
  expect(await desktopStatePresent()).toBe(false);
});
it("gives up on an endpoint that accepts connections but never answers, without deleting it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-hung-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  vi.stubEnv("BLINKLING_RUNTIME_DIR", directory);
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => sockets.add(socket));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  await plant(directory, (server.address() as { port: number }).port);
  const started = Date.now();
  expect(await desktopRunning(300)).toBeUndefined();
  expect(Date.now() - started).toBeLessThan(2000);
  expect(await exists(join(directory, "desktop.json"))).toBe(true);
});
it("a deliberate shutdown request turns the enabled marker off so the extension returns to its own AI", async () => {
  const shutdown = vi.fn();
  const directory = await mkdtemp(join(tmpdir(), "glimpse-shutdown-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  vi.stubEnv("BLINKLING_RUNTIME_DIR", directory);
  await writeFile(join(directory, "enabled.json"), '{"enabled":true}');
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
    onShutdown: shutdown,
    session: {
      subscribe: () => () => {},
      select: async (value: Selection) => value,
      stop: async () => {},
      send: async () => {},
    },
  });
  cleanup.push(() => host.close());
  await fetch(host.address.url + "/rpc", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${host.address.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "shutdown" }),
  });
  await vi.waitFor(() => expect(shutdown).toHaveBeenCalledOnce());
  expect(await exists(join(directory, "enabled.json"))).toBe(false);
});
