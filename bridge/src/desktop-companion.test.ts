// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { PNG } from "pngjs";
import { WebSocket } from "ws";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesktopCompanion } from "./desktop-companion.js";
import { ExtensionBridge } from "./extension-bridge.js";
import { ExtensionSessions } from "./extension-sessions.js";
import { startDesktopHost } from "../../plugin/desktop/host.mjs";
import { discoverDesktop } from "../../plugin/desktop/client.mjs";

it("authenticates reverse capture and guide RPC, with no browser required for the screen fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-gateway-"));
  vi.stubEnv("GLIMPSELET_RUNTIME_DIR", directory);
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
  });
  let origin = "",
    opened = 0;
  const server = createServer((req, res) => {
    void gateway.handle(req, res).catch(() => {
      res.writeHead(400);
      res.end();
    });
  });
  const extension = new ExtensionBridge(server, () => origin, {
    sessions: new ExtensionSessions(directory, async () => []),
  });
  const gateway = new DesktopCompanion(
    () => origin,
    extension,
    async () => {
      opened++;
    },
  );
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No reverse endpoint");
    origin = `http://127.0.0.1:${address.port}`;
    gateway.start();
    await vi.waitFor(async () =>
      expect((await discoverDesktop())?.status.companion).toBe(true),
    );
    expect(await host.fullPage()).toEqual({ companionRequired: true });
    await host.openCompanionGuide();
    expect(opened).toBe(1);
    expect((await fetch(origin + "/desktop-companion")).status).toBe(403);
    const token = (gateway as unknown as { token: string }).token;
    const headers = { Authorization: `Bearer ${token}` };
    expect(
      (
        await fetch(origin, {
          headers: { ...headers, Origin: "https://evil.test" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(origin, { method: "POST", headers, body: "{" })).status,
    ).toBe(400);
    expect(
      (await fetch(origin, { method: "POST", headers, body: "x".repeat(2048) }))
        .status,
    ).toBe(413);
    expect(
      (
        await fetch(origin, {
          method: "POST",
          headers,
          body: '{"method":"unknown"}',
        })
      ).status,
    ).toBe(400);
    expect(opened).toBe(1);
  } finally {
    gateway.close();
    await extension.close();
    await host.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});

const tilePng = (width: number, height: number) => {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return PNG.sync.write(png).toString("base64");
};

it("carries a full page as separate tiles at their own size, with progress while the browser scrolls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-gateway-"));
  vi.stubEnv("GLIMPSELET_RUNTIME_DIR", directory);
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
  });
  let origin = "";
  const server = createServer((req, res) => {
    void gateway.handle(req, res).catch(() => {
      res.writeHead(400);
      res.end();
    });
  });
  const extension = new ExtensionBridge(server, () => origin, {
    sessions: new ExtensionSessions(directory, async () => []),
  });
  const gateway = new DesktopCompanion(
    () => origin,
    extension,
    async () => {},
  );
  let socket: WebSocket | undefined;
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No reverse endpoint");
    origin = `http://127.0.0.1:${address.port}`;
    gateway.start();
    await vi.waitFor(async () =>
      expect((await discoverDesktop())?.status.companion).toBe(true),
    );
    socket = new WebSocket(`${origin.replace("http:", "ws:")}/extension`, {
      origin: `chrome-extension://${"a".repeat(32)}`,
    });
    const paired = new Promise<void>((resolve) =>
      socket!.on("message", (raw) => {
        if (JSON.parse(raw.toString()).type === "paired") resolve();
      }),
    );
    await once(socket, "open");
    socket.send(JSON.stringify({ type: "pair", code: extension.issueCode() }));
    await paired;
    const send = (message: unknown) => socket!.send(JSON.stringify(message));
    // The browser scrolls a long page: progress first, then the tiles.
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== "full-page") return;
      send({
        type: "full-page-progress",
        id: message.id,
        completed: 0,
        total: 4,
      });
      send({
        type: "full-page-progress",
        id: message.id,
        completed: 2,
        total: 4,
      });
      send({
        type: "full-page-progress",
        id: message.id,
        completed: 99,
        total: 4,
      });
      send({
        type: "full-page-result",
        id: message.id,
        images: [tilePng(320, 400), tilePng(320, 400), tilePng(320, 150)],
        truncated: true,
      });
    });

    const progress: unknown[] = [];
    const page = await host.fullPage(undefined, (value) =>
      progress.push(value),
    );

    if ("companionRequired" in page) throw new Error("Companion missing");
    expect(progress).toEqual([
      { completed: 0, total: 4 },
      { completed: 2, total: 4 },
    ]);
    expect(page.tiles.map((t) => [t.pixelWidth, t.pixelHeight])).toEqual([
      [320, 400],
      [320, 400],
      [320, 150],
    ]);
    expect(page.tiles.map((t) => t.image.name)).toEqual([
      "Full page 1 of 3.png",
      "Full page 2 of 3.png",
      "Full page 3 of 3.png",
    ]);
    expect(page.truncated).toBe(true);
    expect(page.image).toBe(page.tiles[0]!.image);
    expect(page.pixelHeight).toBe(400);
  } finally {
    socket?.terminate();
    gateway.close();
    await extension.close();
    await host.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});
