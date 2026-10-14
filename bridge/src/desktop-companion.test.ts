// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createServer } from "node:http";
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
