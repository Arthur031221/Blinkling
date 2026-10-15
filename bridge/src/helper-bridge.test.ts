// @vitest-environment node
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { PNG } from "pngjs";
import { WebSocket } from "ws";
import { afterEach, expect, it, vi } from "vitest";
import { HelperBridge, readElements } from "./helper-bridge.js";
import { connectHelper } from "./helper-test-kit.js";
import { HelperTrust } from "./helper-trust.js";

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const stop of cleanup.splice(0).reverse()) await stop();
});

async function setup(
  options: ConstructorParameters<typeof HelperBridge>[3] = {},
) {
  const trust = new HelperTrust(null);
  let origin = "";
  const server: Server = createServer((_, res) => res.end());
  const bridge = new HelperBridge(server, () => origin, trust, options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cleanup.push(async () => {
    await bridge.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const helper = async () => {
    const socket = await connectHelper(origin, trust.secret());
    cleanup.push(() => socket.terminate());
    return socket;
  };
  return { bridge, trust, origin, helper };
}

const page = {
  url: "https://example.test/",
  title: "Form",
  tabId: 3,
  incognito: false,
};
const frame = { screenX: 10, screenY: 20, devicePixelRatio: 2, zoom: 1 };
const element = (extra: Record<string, unknown> = {}) => ({
  id: "e1",
  kind: "paragraph",
  rect: { x: 1, y: 2, width: 30, height: 40 },
  role: "",
  name: "",
  text: "Hello",
  parentId: null,
  secure: false,
  ...extra,
});
const tilePng = (width: number, height: number) => {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return PNG.sync.write(png).toString("base64");
};

it("accepts only a helper that proves the shared secret, and proves it back", async () => {
  const { origin, trust, bridge } = await setup();
  const good = await connectHelper(origin, trust.secret());
  cleanup.push(() => good.terminate());
  await vi.waitFor(() => expect(bridge.connected).toBe(true));
  await expect(connectHelper(origin, "f".repeat(64))).rejects.toThrow();
});

it("refuses a socket without an extension origin or with a foreign host", async () => {
  const { origin } = await setup();
  const wsUrl = origin.replace("http:", "ws:") + "/extension";
  for (const headers of [
    {},
    { origin: "https://evil.test" },
    { origin: "chrome-extension://short" },
    { origin: `chrome-extension://${"a".repeat(32)}`, host: "evil.test" },
  ]) {
    const socket = new WebSocket(wsUrl, { headers });
    const failure = await Promise.race([
      once(socket, "error").then(() => "error"),
      once(socket, "close").then(() => "close"),
    ]);
    expect(["error", "close"]).toContain(failure);
    socket.terminate();
  }
});

it("closes a socket that never answers the challenge", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    const { origin } = await setup();
    const socket = new WebSocket(
      origin.replace("http:", "ws:") + "/extension",
      {
        origin: `chrome-extension://${"a".repeat(32)}`,
      },
    );
    cleanup.push(() => socket.terminate());
    await once(socket, "open");
    const closed = once(socket, "close");
    await vi.advanceTimersByTimeAsync(5100);
    expect((await closed)[0]).toBe(4001);
  } finally {
    vi.useRealTimers();
  }
});

it("answers a status question with whether Blink is running", async () => {
  const { helper } = await setup({ blinkRunning: async () => true });
  const socket = await helper();
  const answer = once(socket, "message");
  socket.send(JSON.stringify({ type: "status" }));
  expect(JSON.parse(String((await answer)[0]))).toEqual({
    type: "status",
    blink: true,
  });
});

it("wakes Blink on request and reports whether it worked", async () => {
  const wake = vi.fn(async () => true);
  const { helper } = await setup({ wake });
  const socket = await helper();
  const answer = once(socket, "message");
  socket.send(JSON.stringify({ type: "wake", id: "w1" }));
  expect(JSON.parse(String((await answer)[0]))).toEqual({
    type: "wake-result",
    id: "w1",
    ok: true,
  });
  expect(wake).toHaveBeenCalledOnce();
});

it("returns null without a helper and the structure with one, clearing secure fields", async () => {
  const { bridge, helper } = await setup();
  expect(await bridge.elements({ x: 1, y: 1 })).toBeNull();
  const socket = await helper();
  const requests: unknown[] = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type !== "elements") return;
    requests.push(message.point);
    socket.send(
      JSON.stringify({
        type: "elements-result",
        id: message.id,
        result: {
          page,
          frame,
          elements: [
            element(),
            element({
              id: "pw",
              kind: "input",
              role: "textbox",
              name: "Password",
              text: "hunter2",
              secure: true,
              content: { markdown: "hunter2" },
              parentId: "e1",
            }),
          ],
        },
      }),
    );
  });
  const result = await bridge.elements({ x: 640, y: 360 });
  expect(requests).toEqual([{ x: 640, y: 360 }]);
  expect(result?.page).toEqual(page);
  expect(result?.frame).toEqual(frame);
  const secret = result!.elements.find((e) => e.id === "pw")!;
  expect(secret).toMatchObject({ secure: true, name: "", text: "" });
  expect(secret.content).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("hunter2");
});

it("treats a restricted page as null and does not ask again within the cache window", async () => {
  let now = 10_000;
  const { bridge, helper } = await setup({ now: () => now });
  const socket = await helper();
  let asked = 0;
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type !== "elements") return;
    asked++;
    socket.send(
      JSON.stringify({ type: "elements-result", id: message.id, ok: false }),
    );
  });
  expect(await bridge.elements({ x: 5, y: 5 })).toBeNull();
  expect(await bridge.elements({ x: 6, y: 6 })).toBeNull();
  expect(asked).toBe(1);
  now += 5000;
  expect(await bridge.elements({ x: 5, y: 5 })).toBeNull();
  expect(asked).toBe(2);
});

it("a page change clears the cache", async () => {
  const { bridge, helper } = await setup();
  const socket = await helper();
  let asked = 0;
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type !== "elements") return;
    asked++;
    socket.send(
      JSON.stringify({
        type: "elements-result",
        id: message.id,
        result: { page, frame, elements: [element()] },
      }),
    );
  });
  await bridge.elements({ x: 1, y: 1 });
  await bridge.elements({ x: 1, y: 1 });
  expect(asked).toBe(1);
  socket.send(JSON.stringify({ type: "page-changed" }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await bridge.elements({ x: 1, y: 1 });
  expect(asked).toBe(2);
});

it("shapes what a helper reports: caps elements, drops malformed ones and bounds numbers", () => {
  expect(readElements(null)).toBeNull();
  expect(readElements({ page, frame })).toBeNull();
  const many = Array.from({ length: 500 }, (_, i) => element({ id: `n${i}` }));
  const shaped = readElements({
    page,
    frame: { ...frame, zoom: 0, devicePixelRatio: "x" },
    elements: [...many, null, { id: 5 }],
  })!;
  expect(shaped.elements).toHaveLength(400);
  expect(shaped.frame.zoom).toBe(1);
  expect(shaped.frame.devicePixelRatio).toBe(1);
  const odd = readElements({
    page,
    frame,
    elements: [
      element({
        rect: { x: Infinity, y: "a", width: 1e9, height: 5 },
        text: "t".repeat(5000),
      }),
    ],
  })!;
  expect(odd.elements[0]!.rect).toEqual({ x: 0, y: 0, width: 0, height: 5 });
  expect(odd.elements[0]!.text).toHaveLength(2000);
});

it("keeps the element tag and drops anything that is not a short name", () => {
  const out = readElements({
    page,
    frame,
    elements: [element({ tag: "canvas" }), element({ tag: "x".repeat(99) })],
  })!;
  expect(out.elements[0]!.tag).toBe("canvas");
  expect(out.elements[1]!.tag).toHaveLength(20);
  expect(
    readElements({ page, frame, elements: [element({})] })!.elements[0]!.tag,
  ).toBe("");
});

it("carries translate and PDF reader requests and returns the helper's answer", async () => {
  const { bridge, helper } = await setup();
  const socket = await helper();
  const seen: unknown[] = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === "translate-page") {
      seen.push([message.type, message.on]);
      socket.send(
        JSON.stringify({
          type: "translate-page-result",
          id: message.id,
          ok: true,
        }),
      );
    }
    if (message.type === "open-pdf-reader") {
      seen.push([message.type]);
      socket.send(
        JSON.stringify({
          type: "open-pdf-reader-result",
          id: message.id,
          ok: false,
        }),
      );
    }
  });
  expect(await bridge.translatePage(true)).toBe(true);
  expect(await bridge.translatePage(false)).toBe(true);
  expect(await bridge.openPdfReader()).toBe(false);
  expect(seen).toEqual([
    ["translate-page", true],
    ["translate-page", false],
    ["open-pdf-reader"],
  ]);
});

it("sends a cancel of the same kind when the caller gives up", async () => {
  const { bridge, helper } = await setup();
  const socket = await helper();
  const messages: string[] = [];
  socket.on("message", (raw) => messages.push(JSON.parse(String(raw)).type));
  const controller = new AbortController();
  const pending = bridge.translatePage(true, controller.signal);
  await vi.waitFor(() => expect(messages).toContain("translate-page"));
  controller.abort();
  expect(await pending).toBe(false);
  await vi.waitFor(() => expect(messages).toContain("translate-page-cancel"));
});

it("carries a full page as tiles with bounded progress", async () => {
  const { bridge, helper } = await setup();
  const socket = await helper();
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type !== "full-page") return;
    for (const completed of [0, 2, 99])
      socket.send(
        JSON.stringify({
          type: "full-page-progress",
          id: message.id,
          completed,
          total: 4,
        }),
      );
    socket.send(
      JSON.stringify({
        type: "full-page-result",
        id: message.id,
        images: [tilePng(320, 400), tilePng(320, 150)],
        truncated: true,
        page: { url: "https://example.test/", title: "Long" },
      }),
    );
  });
  const progress: unknown[] = [];
  const capture = await bridge.requestFullPage(5000, undefined, (c, t) =>
    progress.push([c, t]),
  );
  expect(progress).toEqual([
    [0, 4],
    [2, 4],
  ]);
  expect(capture?.tiles.map((t) => [t.width, t.height])).toEqual([
    [320, 400],
    [320, 150],
  ]);
  expect(capture?.truncated).toBe(true);
  expect(capture?.page?.title).toBe("Long");
});

it("gives up on a full page when no helper comes back within the grace period", async () => {
  const { bridge } = await setup();
  expect(
    await bridge.requestFullPage(1000, undefined, undefined, 150),
  ).toBeUndefined();
});

it("runs translation batches through the CLI provider without a desktop session", async () => {
  const provider = vi.fn(async () => ({ answer: '{"t":["Hola"]}' }));
  const { helper } = await setup({ provider });
  const socket = await helper();
  const answer = once(socket, "message");
  socket.send(
    JSON.stringify({
      type: "translate-batch",
      id: "b1",
      prompt: "Translate",
      model: "opus",
    }),
  );
  expect(JSON.parse(String((await answer)[0]))).toEqual({
    type: "translate-batch-result",
    id: "b1",
    ok: true,
    answer: '{"t":["Hola"]}',
  });
  expect(provider).toHaveBeenCalledWith(
    expect.objectContaining({ question: "Translate", model: "opus" }),
  );
});

it("rejects an empty or oversized translation prompt and an unknown model falls back to haiku", async () => {
  const provider = vi.fn(async () => ({ answer: "ok" }));
  const { helper } = await setup({ provider });
  const socket = await helper();
  const next = () =>
    once(socket, "message").then(([raw]) => JSON.parse(String(raw)));
  let answer = next();
  socket.send(
    JSON.stringify({ type: "translate-batch", id: "x", prompt: "  " }),
  );
  expect(await answer).toMatchObject({ id: "x", ok: false });
  answer = next();
  socket.send(
    JSON.stringify({
      type: "translate-batch",
      id: "y",
      prompt: "p".repeat(70_000),
    }),
  );
  expect(await answer).toMatchObject({ id: "y", ok: false });
  answer = next();
  socket.send(
    JSON.stringify({
      type: "translate-batch",
      id: "z",
      prompt: "go",
      model: "gpt",
    }),
  );
  expect(await answer).toMatchObject({ id: "z", ok: true });
  expect(provider).toHaveBeenCalledWith(
    expect.objectContaining({ model: "haiku" }),
  );
});

it("cancelling everything tells the helper which kind of work to stop", async () => {
  const { bridge, helper } = await setup();
  const socket = await helper();
  const messages: string[] = [];
  socket.on("message", (raw) => messages.push(JSON.parse(String(raw)).type));
  const pending = bridge.requestFullPage(5000);
  await vi.waitFor(() => expect(messages).toContain("full-page"));
  bridge.cancelPending();
  expect(await pending).toBeUndefined();
  await vi.waitFor(() => expect(messages).toContain("full-page-cancel"));
});
