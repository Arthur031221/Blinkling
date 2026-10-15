// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import WebSocket from "ws";
import { CompanionServer } from "../src/companion-server.js";

const servers: CompanionServer[] = [];
const sockets: WebSocket[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function setup() {
  vi.stubEnv("BLINKLING_DISABLE_BROWSER_OPEN", "1");
  const assetsDir = await mkdtemp(join(tmpdir(), "blinkling-companion-"));
  directories.push(assetsDir);
  await mkdir(join(assetsDir, "assets"));
  await writeFile(join(assetsDir, "assets/logo.svg"), "<svg/>");
  await writeFile(join(assetsDir, "assets/secret.txt"), "no");
  const server = await new CompanionServer({ assetsDir }).start();
  servers.push(server);
  return { server, assetsDir };
}

async function pair(server: CompanionServer) {
  const code = server.bridge.issueCode();
  const socket = new WebSocket(
    `${server.origin.replace("http", "ws")}/extension`,
    {
      origin: `chrome-extension://${"a".repeat(32)}`,
    },
  );
  sockets.push(socket);
  await once(socket, "open");
  const paired = new Promise((resolve) =>
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "paired") resolve(message);
    }),
  );
  socket.send(JSON.stringify({ type: "pair", code }));
  await paired;
  return code;
}

function withHost(server: CompanionServer, host: string) {
  const address = new URL(server.origin);
  return new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: address.hostname,
        port: address.port,
        path: "/install",
        headers: { host },
      },
      (res) => {
        res.resume();
        res.once("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.once("error", reject);
    req.end();
  });
}

describe("companion server HTTP", () => {
  it("serves the install guide only to the loopback host, with a strict CSP", async () => {
    const { server } = await setup();
    const page = await fetch(`${server.origin}/install#code=0123456789ABCDEF`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain(
      "script-src 'self'",
    );
    expect(await page.text()).toContain("/install-guide.js");
    const script = await fetch(`${server.origin}/install-guide.js`);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(await withHost(server, "evil.example")).toBe(403);
    expect(
      await withHost(server, `localhost:${new URL(server.origin).port}`),
    ).toBe(403);
  });

  it("serves only image assets inside its own folder", async () => {
    const { server } = await setup();
    const logo = await fetch(`${server.origin}/assets/logo.svg`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/svg+xml");
    expect((await fetch(`${server.origin}/assets/secret.txt`)).status).toBe(
      404,
    );
    expect(
      (await fetch(`${server.origin}/assets/../package.json`)).status,
    ).toBe(404);
    expect((await fetch(`${server.origin}/assets/%2e%2e/x.png`)).status).toBe(
      404,
    );
    expect((await fetch(`${server.origin}/assets/missing.png`)).status).toBe(
      404,
    );
  });

  it("exposes no chat, session or model endpoint", async () => {
    const { server } = await setup();
    for (const path of [
      "/api/session",
      "/api/ask",
      "/api/stream",
      "/panel",
      "/",
    ])
      expect((await fetch(`${server.origin}${path}`)).status).toBe(404);
  });

  it("reports pairing per setup code and expires unknown codes", async () => {
    const { server } = await setup();
    const unknown = await fetch(
      `${server.origin}/install/status?code=FFFFFFFFFFFFFFFF`,
    );
    expect(unknown.status).toBe(401);
    const code = server.bridge.issueCode();
    const waiting = await fetch(`${server.origin}/install/status?code=${code}`);
    expect(await waiting.json()).toEqual({ connected: false, active: false });
    const paired = await pair(server);
    expect(
      await (
        await fetch(`${server.origin}/install/status?code=${paired}`)
      ).json(),
    ).toEqual({ connected: true, active: true });
  });

  it("reveals the folder only for a POST from its own page", async () => {
    const { server } = await setup();
    const code = server.bridge.issueCode();
    const url = `${server.origin}/install/reveal?code=${code}`;
    expect((await fetch(url, { method: "POST" })).status).toBe(403);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { origin: "https://example.com" },
        })
      ).status,
    ).toBe(403);
    expect((await fetch(url)).status).toBe(403);
  });

  it("guards the reverse RPC with the bearer token", async () => {
    const { server } = await setup();
    const response = await fetch(`${server.origin}/desktop-companion`, {
      method: "POST",
      headers: { authorization: "Bearer nope" },
      body: JSON.stringify({ method: "elements" }),
    });
    expect(response.status).toBe(403);
  });
});
