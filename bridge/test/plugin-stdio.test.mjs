import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import { request } from "node:http";
import { PNG } from "pngjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
const image = () => {
  const png = new PNG({ width: 3, height: 2 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([31, 99, 177, 255], i);
  return PNG.sync.write(png).toString("base64");
};
const proof = (secret, role, first, second) =>
  createHmac("sha256", secret)
    .update(`${role}:${first}:${second}`)
    .digest("hex");
/** The helper's side of the handshake, as the extension performs it. */
const connectHelper = async (panel, secret, origin = extensionOrigin) => {
  const socket = new WebSocket(`${panel.replace("http", "ws")}/extension`, {
    origin,
  });
  const nonce = "c".repeat(32);
  const ready = new Promise((resolveReady, rejectReady) => {
    let challenge = "";
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "challenge") {
        challenge = message.nonce;
        socket.send(
          JSON.stringify({
            type: "hello",
            nonce,
            proof: proof(secret, "client", challenge, nonce),
          }),
        );
      }
      if (message.type === "ready") {
        if (message.proof === proof(secret, "server", nonce, challenge))
          resolveReady();
        else rejectReady(new Error("The bridge did not prove the secret"));
      }
    });
    socket.once("close", () => rejectReady(new Error("closed")));
    socket.once("error", rejectReady);
  });
  ready.catch(() => undefined);
  await ready;
  return socket;
};

test(
  "standalone plugin serves the helper handshake and screen tools from outside the repository",
  { timeout: 20_000 },
  async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "blinkling-outside-"));
    const host = join(cwd, "host");
    const plugin = join(host, "plugin");
    await cp(resolve("bin"), join(plugin, "bin"), { recursive: true });
    await cp(resolve("package.json"), join(plugin, "package.json"));
    await writeFile(
      join(host, "package.json"),
      JSON.stringify({ name: "unrelated-host", version: "99.99.99" }),
    );
    const fixturePath = join(cwd, "fixture.png");
    await writeFile(fixturePath, Buffer.from(image(), "base64"));
    await mkdir(join(cwd, "runtime"));
    const client = new Client({
      name: "blinkling-integration",
      version: "1.0.0",
    });
    const sockets = [];
    let processClosed;
    t.after(async () => {
      for (const socket of sockets) {
        if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
      }
      try {
        await client.close();
      } catch {
        await Promise.resolve();
      }
      if (processClosed) await processClosed;
      await rm(cwd, { recursive: true, force: true });
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(plugin, "bin", "blinkling.cjs")],
      cwd,
      env: {
        ...process.env,
        HOME: cwd,
        BLINKLING_TEST_MODE: "1",
        BLINKLING_TEST_FIXTURE: fixturePath,
        BLINKLING_PORT: "0",
        BLINKLING_RUNTIME_DIR: join(cwd, "runtime"),
        BLINKLING_DISABLE_BROWSER_OPEN: "1",
      },
    });
    await client.connect(transport);
    const child = transport._process;
    processClosed = once(child, "close");
    const tools = (await client.listTools()).tools
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(
      tools,
      [
        "desktop_open",
        "extension_install",
        "screen_capture",
        "screen_clear",
        "screen_history",
        "screen_latest",
        "screen_notes",
        "screen_watch_start",
        "screen_watch_stop",
      ].sort(),
    );

    const opened = await client.callTool({
      name: "extension_install",
      arguments: {},
    });
    const url = /https?:\/\/127\.0\.0\.1:\d+\/install#code=([A-F0-9]{16})/.exec(
      opened.content[0].text,
    );
    assert.ok(url, opened.content[0].text);
    assert.doesNotMatch(opened.content[0].text, /pair|ssh|channel/i);
    const panel = url[0].split("/install")[0];
    const code = url[1];
    const origin = new URL(panel).origin;
    const guide = await fetch(`${panel}/install`);
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), /Blinkling/);
    for (const gone of [
      "/install/extension.zip",
      "/api/session",
      "/api/capture",
    ])
      assert.equal(
        (await fetch(`${panel}${gone}`, { method: "POST" })).status === 404 ||
          (await fetch(`${panel}${gone}`)).status === 404,
        true,
        `${gone} must not exist`,
      );

    const post = (path, headers, body = "{}") =>
      new Promise((resolveRequest, rejectRequest) => {
        const req = request(
          panel + path,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
          },
          (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () =>
              resolveRequest({
                status: res.statusCode,
                body: Buffer.concat(chunks).toString(),
              }),
            );
          },
        );
        req.once("error", rejectRequest);
        req.end(body);
      });
    assert.equal(
      (
        await post(
          "/install/trust",
          { Origin: "http://example.com" },
          JSON.stringify({ code }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "/install/trust",
          { Host: "localhost:1", Origin: origin },
          JSON.stringify({ code }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "/install/trust",
          { Origin: origin },
          JSON.stringify({ code: "0".repeat(16) }),
        )
      ).status,
      401,
    );
    const granted = await post(
      "/install/trust",
      { Origin: origin },
      JSON.stringify({ code }),
    );
    assert.equal(granted.status, 200);
    const { secret, port } = JSON.parse(granted.body);
    assert.match(secret, /^[a-f0-9]{64}$/);
    assert.equal(port, Number(new URL(panel).port));
    assert.equal(
      (
        await post(
          "/install/trust",
          { Origin: origin },
          JSON.stringify({ code }),
        )
      ).status,
      401,
      "a link code works once",
    );
    assert.equal(
      (await stat(join(cwd, "runtime", "helper.json"))).mode & 0o077,
      0,
      "the secret file is private to the user",
    );

    const stranger = new WebSocket(`${panel.replace("http", "ws")}/extension`, {
      origin: "https://example.com",
    });
    await assert.rejects(once(stranger, "open"));
    await assert.rejects(connectHelper(panel, "f".repeat(64)));
    const socket = await connectHelper(panel, secret);
    sockets.push(socket);
    assert.deepEqual(
      await (await fetch(`${panel}/install/status?code=${code}`)).json(),
      { connected: true },
      "the setup page sees the helper connect",
    );
    assert.equal(
      (await fetch(`${panel}/install/status?code=${"0".repeat(16)}`)).status,
      401,
    );
    const second = await client.callTool({
      name: "extension_install",
      arguments: {},
    });
    const fresh = /install#code=([A-F0-9]{16})/.exec(second.content[0].text);
    assert.ok(fresh && fresh[1] !== code);
    assert.equal(
      (await (await fetch(`${panel}/install/status?code=${fresh[1]}`)).json())
        .connected,
      true,
    );

    const captured = await client.callTool({
      name: "screen_capture",
      arguments: { target: "screen" },
    });
    assert.equal(captured.content[1].mimeType, "image/png");
    const latest = await client.callTool({
      name: "screen_latest",
      arguments: {},
    });
    assert.match(latest.content[0].text, /fixture|screen/i);
    const note = await client.callTool({
      name: "screen_notes",
      arguments: { action: "add", text: "Keep this frame", role: "user" },
    });
    assert.match(note.content[0].text, /Keep this frame/);
    const cleared = await client.callTool({
      name: "screen_clear",
      arguments: {},
    });
    assert.match(cleared.content[0].text, /cleared/);
    assert.match(
      (await client.callTool({ name: "screen_history", arguments: {} }))
        .content[0].text,
      /No recent captures/,
    );
    const watch = await client.callTool({
      name: "screen_watch_start",
      arguments: { interval_seconds: 5 },
    });
    assert.match(watch.content[0].text, /Screen watch started/);
    const stopped = await client.callTool({
      name: "screen_watch_stop",
      arguments: {},
    });
    assert.match(stopped.content[0].text, /Screen watch stopped/);
    const invalid = await client.callTool({
      name: "screen_capture",
      arguments: { target: "desktop" },
    });
    assert.equal(invalid.isError, true);

    socket.close();
    await once(socket, "close");
    child.kill("SIGTERM");
    await processClosed;
    assert.equal(child.exitCode, 0);
  },
);
