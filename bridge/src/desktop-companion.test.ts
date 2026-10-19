// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { PNG } from "pngjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesktopCompanion } from "./desktop-companion.js";
import { HelperBridge } from "./helper-bridge.js";
import { connectHelper } from "./helper-test-kit.js";
import { HelperTrust } from "./helper-trust.js";
import { startDesktopHost } from "../../plugin/desktop/host.mjs";
import { discoverDesktop } from "../../plugin/desktop/client.mjs";

const tilePng = (width: number, height: number) => {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return PNG.sync.write(png).toString("base64");
};

async function rig(openGuide: () => Promise<unknown> = async () => {}) {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-gateway-"));
  vi.stubEnv("BLINKLING_RUNTIME_DIR", directory);
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
  });
  let origin = "";
  const trust = new HelperTrust(null);
  const server = createServer((req, res) => {
    void gateway.handle(req, res).catch(() => {
      res.writeHead(400);
      res.end();
    });
  });
  const helper = new HelperBridge(server, () => origin, trust);
  const gateway = new DesktopCompanion(() => origin, helper, openGuide);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No reverse endpoint");
  origin = `http://127.0.0.1:${address.port}`;
  gateway.start();
  await vi.waitFor(async () =>
    expect((await discoverDesktop())?.status.companion).toBe(true),
  );
  return {
    host,
    gateway,
    server,
    origin,
    trust,
    close: async () => {
      gateway.close();
      await helper.close();
      await host.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await rm(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    },
  };
}

it("authenticates reverse RPC, with no browser required for the screen fallback", async () => {
  let opened = 0;
  const app = await rig(async () => {
    opened++;
  });
  try {
    expect(await app.host.fullPage()).toEqual({ companionRequired: true });
    expect(await app.host.elements({ point: { x: 1, y: 1 } })).toBeNull();
    expect(await app.host.translatePage({ on: true })).toEqual({ ok: false });
    expect(await app.host.openPdfReader()).toEqual({ ok: false });
    await app.host.openCompanionGuide();
    expect(opened).toBe(1);
    expect((await fetch(app.origin + "/desktop-companion")).status).toBe(403);
    const token = (app.gateway as unknown as { token: string }).token;
    const headers = { Authorization: `Bearer ${token}` };
    expect(
      (
        await fetch(app.origin, {
          headers: { ...headers, Origin: "https://evil.test" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(app.origin, { method: "POST", headers, body: "{" })).status,
    ).toBe(400);
    expect(
      (
        await fetch(app.origin, {
          method: "POST",
          headers,
          body: "x".repeat(2048),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await fetch(app.origin, {
          method: "POST",
          headers,
          body: '{"method":"unknown"}',
        })
      ).status,
    ).toBe(400);
    expect(opened).toBe(1);
  } finally {
    await app.close();
  }
});

it("carries a full page as separate tiles at their own size, with progress while the browser scrolls", async () => {
  const app = await rig();
  try {
    const socket = await connectHelper(app.origin, app.trust.secret());
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== "full-page") return;
      for (const completed of [0, 2, 99])
        send({
          type: "full-page-progress",
          id: message.id,
          completed,
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
    const page = await app.host.fullPage(undefined, (value) =>
      progress.push(value),
    );
    socket.terminate();
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
    await app.close();
  }
});

it("host.elements reaches the helper again when the read must be fresh", async () => {
  const app = await rig();
  try {
    const socket = await connectHelper(app.origin, app.trust.secret());
    let asked = 0;
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== "elements") return;
      asked++;
      socket.send(
        JSON.stringify({
          type: "elements-result",
          id: message.id,
          result: {
            page: {
              url: "https://example.test/",
              title: "",
              tabId: 1,
              incognito: false,
            },
            frame: { screenX: 0, screenY: 0, devicePixelRatio: 1, zoom: 1 },
            elements: [],
          },
        }),
      );
    });
    const point = { x: 50, y: 150 };
    await app.host.elements({ point });
    await app.host.elements({ point });
    expect(asked).toBe(1);
    await app.host.elements({ point, fresh: true });
    expect(asked).toBe(2);
    socket.terminate();
  } finally {
    await app.close();
  }
});

it("host.elements, translatePage and openPdfReader reach the helper end to end", async () => {
  const app = await rig();
  try {
    const socket = await connectHelper(app.origin, app.trust.secret());
    const seen: unknown[] = [];
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      seen.push(message.type);
      if (message.type === "elements")
        socket.send(
          JSON.stringify({
            type: "elements-result",
            id: message.id,
            result: {
              page: {
                url: "https://example.test/login",
                title: "Log in",
                tabId: 9,
                incognito: false,
              },
              frame: {
                screenX: 0,
                screenY: 90,
                devicePixelRatio: 1,
                zoom: 1,
                scrollX: 0,
                scrollY: 640,
                pageWidth: 1200,
                pageHeight: 5000,
                viewWidth: 1200,
                viewHeight: 800,
              },
              elements: [
                {
                  id: "pw",
                  kind: "input",
                  rect: { x: 10, y: 20, width: 200, height: 30 },
                  role: "textbox",
                  name: "Password",
                  text: "hunter2",
                  parentId: null,
                  secure: true,
                },
              ],
            },
          }),
        );
      if (message.type === "scroll-page")
        socket.send(
          JSON.stringify({
            type: "scroll-page-result",
            id: message.id,
            ok: message.y === 1200,
          }),
        );
      if (
        message.type === "translate-page" ||
        message.type === "open-pdf-reader"
      )
        socket.send(
          JSON.stringify({
            type: `${message.type}-result`,
            id: message.id,
            ok: true,
          }),
        );
    });
    const result = await app.host.elements({ point: { x: 50, y: 150 } });
    expect(result?.page.tabId).toBe(9);
    expect(result?.elements[0]).toMatchObject({
      secure: true,
      name: "",
      text: "",
    });
    expect(result?.frame).toMatchObject({
      scrollY: 640,
      pageWidth: 1200,
      pageHeight: 5000,
      viewHeight: 800,
    });
    expect(
      await app.host.scrollPage({ point: { x: 50, y: 150 }, y: 1200 }),
    ).toEqual({ ok: true });
    expect(await app.host.scrollPage({ y: 99 })).toEqual({ ok: false });
    expect(await app.host.translatePage({ on: true })).toEqual({ ok: true });
    expect(await app.host.openPdfReader()).toEqual({ ok: true });
    expect(seen).toEqual([
      "elements",
      "scroll-page",
      "scroll-page",
      "translate-page",
      "open-pdf-reader",
    ]);
    socket.terminate();
  } finally {
    await app.close();
  }
});

it("registers again when the desktop has dropped the companion", async () => {
  const app = await rig();
  try {
    const port = Number(new URL(app.origin).port);
    await new Promise<void>((resolve) => {
      app.server.close(() => resolve());
      app.server.closeAllConnections();
    });
    // A refused connection makes the desktop forget the companion.
    expect(await app.host.fullPage()).toEqual({ companionRequired: true });
    expect((await discoverDesktop())?.status.companion).toBe(false);
    await new Promise<void>((resolve) =>
      app.server.listen(port, "127.0.0.1", resolve),
    );
    await vi.waitFor(
      async () =>
        expect((await discoverDesktop())?.status.companion).toBe(true),
      { timeout: 6000 },
    );
  } finally {
    await app.close();
  }
}, 12_000);
