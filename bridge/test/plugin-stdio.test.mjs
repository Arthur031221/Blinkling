import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createServer } from "node:net";
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
const freePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
};
const waitForMessage = (socket, messages, type) =>
  new Promise((resolveMessage, rejectMessage) => {
    const found = messages.findIndex((message) => message.type === type);
    if (found >= 0) return resolveMessage(messages.splice(found, 1)[0]);
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      rejectMessage(new Error(`Timed out waiting for ${type}`));
    }, 5_000);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== type) {
        messages.push(message);
        return;
      }
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolveMessage(message);
    };
    socket.on("message", onMessage);
  });

test(
  "standalone plugin serves the browser helper pairing and screen tools from outside the repository",
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
    const png = Buffer.from(image(), "base64");
    await writeFile(fixturePath, png);
    const port = await freePort();
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
        BLINKLING_PORT: String(port),
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
    assert.doesNotMatch(
      opened.content[0].text,
      /--dangerously-load-development-channels|\bpair/i,
    );
    const panel = url[0].split("/install")[0];
    const code = url[1];
    const guide = await fetch(`${panel}/install`);
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), /Blinkling/);
    for (const gone of ["/api/session", "/api/clear", "/api/capture"])
      assert.equal(
        (await fetch(panel + gone, { method: "POST", body: "{}" })).status,
        404,
        `${gone} belonged to the removed floating chat`,
      );

    const socket = new WebSocket(`${panel.replace("http", "ws")}/extension`, {
      origin: extensionOrigin,
    });
    sockets.push(socket);
    const messages = [];
    socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await once(socket, "open");
    socket.send(JSON.stringify({ type: "pair", code }));
    const paired = await waitForMessage(socket, messages, "paired");
    assert.match(paired.token, /^[a-f0-9]{64}$/);
    const status = await fetch(`${panel}/install/status?code=${code}`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).connected, true);

    const replayedCode = new WebSocket(
      `${panel.replace("http", "ws")}/extension`,
      { origin: extensionOrigin },
    );
    sockets.push(replayedCode);
    const replayMessages = [];
    replayedCode.on("message", (raw) =>
      replayMessages.push(JSON.parse(raw.toString())),
    );
    await once(replayedCode, "open");
    replayedCode.send(JSON.stringify({ type: "pair", code }));
    assert.equal(
      (await waitForMessage(replayedCode, replayMessages, "error")).code,
      "pairing_expired",
    );
    const wrongExtension = new WebSocket(
      `${panel.replace("http", "ws")}/extension`,
      { origin: "https://example.com" },
    );
    await assert.rejects(once(wrongExtension, "open"));

    const shot = await client.callTool({
      name: "screen_capture",
      arguments: { target: "screen" },
    });
    assert.equal(shot.content[1].mimeType, "image/png");
    assert.match(shot.content[0].text, /test fixture/);
    assert.match(
      (await client.callTool({ name: "screen_latest", arguments: {} }))
        .content[0].text,
      /test fixture/,
    );
    assert.match(
      (await client.callTool({ name: "screen_history", arguments: {} }))
        .content[0].text,
      /test fixture/,
    );
    const note = await client.callTool({
      name: "screen_notes",
      arguments: { action: "add", text: "Keep this frame", role: "user" },
    });
    assert.match(note.content[0].text, /Keep this frame/);
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
    assert.match(
      (
        await client.callTool({
          name: "screen_notes",
          arguments: { action: "list" },
        })
      ).content[0].text,
      /No notes yet/,
    );
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
