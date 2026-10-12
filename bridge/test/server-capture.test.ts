// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PNG } from "pngjs";
import WebSocket from "ws";
import { createGlimpselet } from "../src/server.js";
import { cancelled } from "../src/errors.js";
import type { CaptureAdapter } from "../src/capture.js";

const nativeDiscovery = vi.hoisted(() => ({
  resolve: undefined as ((adapter: CaptureAdapter) => void) | undefined,
}));
vi.mock("../src/capture.js", async (importOriginal) => {
  const capture = await importOriginal<typeof import("../src/capture.js")>();
  return {
    ...capture,
    createNativeAdapter: () =>
      new Promise<CaptureAdapter>((resolve) => {
        nativeDiscovery.resolve = resolve;
      }),
  };
});

const apps: Awaited<ReturnType<typeof createGlimpselet>>[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(clients.splice(0).map((client) => client.close()));
  vi.restoreAllMocks();
  nativeDiscovery.resolve = undefined;
});
const image = () => {
  const png = new PNG({ width: 8, height: 6 });
  png.data.fill(255);
  return PNG.sync.write(png);
};
async function connect(adapter?: CaptureAdapter) {
  const app = await createGlimpselet(adapter ? { adapter } : {});
  apps.push(app);
  const client = new Client({ name: "capture-test", version: "1.0.0" });
  clients.push(client);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await app.server.connect(serverTransport);
  await client.connect(clientTransport);
  return { app, client };
}
const supported = {
  screen: true,
  window: true,
  region: true,
  last_selection: true,
};

const nativeAdapter = (): CaptureAdapter => ({
  supported,
  capture: vi.fn(async () => ({
    image: image(),
    source: "native test adapter",
  })),
});

async function waitForDiscovery() {
  await vi.waitFor(() => expect(nativeDiscovery.resolve).toBeDefined());
}

function interceptIntervals() {
  const callbacks: (() => Promise<void>)[] = [];
  const interval = vi.spyOn(globalThis, "setInterval").mockImplementation(((
    callback: () => void,
  ) => {
    callbacks.push(callback as () => Promise<void>);
    return { unref() {} } as NodeJS.Timeout;
  }) as typeof setInterval);
  return { callbacks, interval };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

it.each(["stop", "clear"] as const)(
  "does not start a late watch timer when %s runs during native discovery",
  async (action) => {
    nativeDiscovery.resolve = undefined;
    const { app, client } = await connect();
    const { callbacks, interval } = interceptIntervals();
    const start = client.callTool({
      name: "screen_watch_start",
      arguments: {},
    });
    await waitForDiscovery();

    await client.callTool({
      name: action === "stop" ? "screen_watch_stop" : "screen_clear",
      arguments: {},
    });
    const adapter = nativeAdapter();
    nativeDiscovery.resolve!(adapter);
    await start;
    await settle();

    expect(interval).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(0);
    expect(adapter.capture).not.toHaveBeenCalled();
    expect(app.history.all()).toHaveLength(0);
  },
);

it("does not start a late watch timer when its MCP request is cancelled during discovery", async () => {
  nativeDiscovery.resolve = undefined;
  const { app, client } = await connect();
  const { callbacks, interval } = interceptIntervals();
  const controller = new AbortController();
  const start = client
    .callTool({ name: "screen_watch_start", arguments: {} }, undefined, {
      signal: controller.signal,
    })
    .catch(() => undefined);
  await waitForDiscovery();

  controller.abort();
  const adapter = nativeAdapter();
  nativeDiscovery.resolve!(adapter);
  await start;
  await settle();

  expect(interval).not.toHaveBeenCalled();
  expect(callbacks).toHaveLength(0);
  expect(adapter.capture).not.toHaveBeenCalled();
  expect(app.history.all()).toHaveLength(0);
});

it("retains the unchanged frame rejected by the six-per-minute watch cap after it resets", async () => {
  let now = 1_000;
  const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
  const frames = Array.from({ length: 7 }, (_, index) => {
    const png = new PNG({ width: 8, height: 6 });
    for (let pixel = 0; pixel < png.data.length; pixel += 4) {
      png.data[pixel] = index + 1;
      png.data[pixel + 1] = 40;
      png.data[pixel + 2] = 90;
      png.data[pixel + 3] = 255;
    }
    return PNG.sync.write(png);
  });
  let frame = 0;
  const capture = vi.fn(async () => ({
    image: frames[Math.min(frame++, frames.length - 1)]!,
    source: "native test adapter",
  }));
  const { app, client } = await connect({ supported, capture });
  const { callbacks } = interceptIntervals();
  await client.callTool({ name: "screen_watch_start", arguments: {} });
  expect(callbacks).toHaveLength(1);

  for (let index = 0; index < 7; index++) await callbacks[0]!();
  expect(capture).toHaveBeenCalledTimes(7);
  expect(app.history.all()).toHaveLength(6);

  now += 60_001;
  await callbacks[0]!();
  expect(capture).toHaveBeenCalledTimes(8);
  expect(app.history.all()).toHaveLength(7);
  expect(app.history.latest()!.image).toEqual(frames[6]);
  nowSpy.mockRestore();
});

it("does not substitute native capture when the shared browser surface times out", async () => {
  process.env.GLIMPSELET_DISABLE_BROWSER_OPEN = "1";
  const native = vi.fn(async () => ({
    image: image(),
    source: "native test adapter",
  }));
  const { app, client } = await connect({ supported, capture: native });
  const url = new URL((await app.panel.openUrl()).match(/http:\/\/[^ ]+$/)![0]);
  const response = await fetch(`${url.origin}/api/session`, {
    method: "POST",
    headers: { Origin: url.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token: url.hash.slice(1) }),
  });
  const { session } = (await response.json()) as { session: string };
  const ws = new WebSocket(
    `${url.origin.replace("http", "ws")}/api/stream`,
    ["glimpselet", session],
    { origin: url.origin },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    ws.send(JSON.stringify({ type: "share", active: true }));
    await vi.waitFor(() => expect(app.panel.isSharing).toBe(true));
    const result = await client.callTool({
      name: "screen_capture",
      arguments: { target: "screen" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("did not reply");
    expect(native).not.toHaveBeenCalled();
    expect(app.history.all()).toHaveLength(0);
    ws.send(JSON.stringify({ type: "share", active: false }));
    await vi.waitFor(() => expect(app.panel.isSharing).toBe(false));
    const fallback = await client.callTool({
      name: "screen_capture",
      arguments: { target: "screen" },
    });
    expect(fallback.isError).toBeFalsy();
    expect(native).toHaveBeenCalledOnce();
  } finally {
    ws.terminate();
  }
}, 6000);

it("clear waits for native cancellation and prevents a late frame from entering history", async () => {
  let captureSignal: AbortSignal | undefined;
  let nativeExited = false;
  const { app, client } = await connect({
    supported,
    capture: async (_target, signal) => {
      captureSignal = signal;
      return new Promise((resolve, reject) => {
        signal!.addEventListener(
          "abort",
          () => {
            setTimeout(() => {
              nativeExited = true;
              reject(cancelled());
            }, 20);
          },
          { once: true },
        );
        void resolve;
      });
    },
  });
  const capture = client.callTool({
    name: "screen_capture",
    arguments: { target: "region" },
  });
  await vi.waitFor(() => expect(captureSignal).toBeDefined());
  await client.callTool({ name: "screen_clear", arguments: {} });
  expect(nativeExited).toBe(true);
  expect(captureSignal!.aborted).toBe(true);
  expect((await capture).isError).toBe(true);
  expect(app.history.all()).toHaveLength(0);
});

it("keeps sharing intent after socket disconnect until an explicit stop", async () => {
  process.env.GLIMPSELET_DISABLE_BROWSER_OPEN = "1";
  const native = vi.fn(async () => ({
    image: image(),
    source: "native test adapter",
  }));
  const { app, client } = await connect({ supported, capture: native });
  const url = new URL((await app.panel.openUrl()).match(/http:\/\/[^ ]+$/)![0]);
  const response = await fetch(`${url.origin}/api/session`, {
    method: "POST",
    headers: { Origin: url.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token: url.hash.slice(1) }),
  });
  const { session } = (await response.json()) as { session: string };
  const socketUrl = `${url.origin.replace("http", "ws")}/api/stream`;
  const connectSocket = async () => {
    const socket = new WebSocket(socketUrl, ["glimpselet", session], {
      origin: url.origin,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return socket;
  };
  const first = await connectSocket();
  first.send(JSON.stringify({ type: "share", active: true }));
  await vi.waitFor(() => expect(app.panel.isSharing).toBe(true));
  const closed = new Promise<void>((resolve) =>
    first.once("close", () => resolve()),
  );
  first.terminate();
  await closed;

  const blocked = await client.callTool({
    name: "screen_capture",
    arguments: { target: "screen" },
  });
  expect(blocked.isError).toBe(true);
  expect(native).not.toHaveBeenCalled();
  expect(app.history.all()).toHaveLength(0);

  const second = await connectSocket();
  second.send(JSON.stringify({ type: "share", active: false }));
  await vi.waitFor(() => expect(app.panel.isSharing).toBe(false));
  const fallback = await client.callTool({
    name: "screen_capture",
    arguments: { target: "screen" },
  });
  expect(fallback.isError).toBeFalsy();
  expect(native).toHaveBeenCalledOnce();
  second.terminate();
}, 6000);

it("passes MCP cancellation to native capture and rejects its late image", async () => {
  let nativeSignal: AbortSignal | undefined;
  let finish!: (capture: { image: Buffer; source: string }) => void;
  const { app, client } = await connect({
    supported,
    capture: async (_target, signal) => {
      nativeSignal = signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const controller = new AbortController();
  const pending = client
    .callTool(
      { name: "screen_capture", arguments: { target: "screen" } },
      undefined,
      { signal: controller.signal },
    )
    .then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
  await vi.waitFor(() => expect(nativeSignal).toBeDefined());
  controller.abort();
  await vi.waitFor(() => expect(nativeSignal!.aborted).toBe(true));
  finish({ image: image(), source: "late native image" });
  const outcome = await pending;
  expect(outcome).toHaveProperty("error");
  await client.callTool({ name: "screen_clear", arguments: {} });
  expect(app.history.all()).toHaveLength(0);
});
