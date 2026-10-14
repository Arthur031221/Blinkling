import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createServer } from "node:net";
import { request } from "node:http";
import { PNG } from "pngjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";
import { inflateRawSync } from "node:zlib";

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
  "standalone plugin serves paired extension and screen tools from outside the repository",
  { timeout: 20_000 },
  async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "glimpselet-outside-"));
    const host = join(cwd, "host");
    const plugin = join(host, "plugin");
    await cp(resolve("bin"), join(plugin, "bin"), { recursive: true });
    await cp(resolve("package.json"), join(plugin, "package.json"));
    await writeFile(
      join(host, "package.json"),
      JSON.stringify({ name: "unrelated-host", version: "99.99.99" }),
    );
    const version = JSON.parse(
      await readFile(resolve("package.json"), "utf8"),
    ).version;
    const fixturePath = join(cwd, "fixture.png");
    const png = Buffer.from(image(), "base64");
    await writeFile(fixturePath, png);
    const bin = join(cwd, "bin");
    await mkdir(bin);
    const fakeCli = join(bin, "claude");
    const argvLog = join(cwd, "argv.json");
    await writeFile(
      fakeCli,
      `#!/usr/bin/env node\nconst fs = require('node:fs');\nfs.writeFileSync(process.env.MOCK_ARGV_LOG, JSON.stringify(process.argv.slice(2)));\nconst lines = [{type:'stream_event',event:{delta:{type:'text_delta',text:'Mocked '}}},{type:'stream_event',event:{delta:{type:'text_delta',text:'answer'}}},{type:'result',is_error:false,result:'Mocked answer',usage:{input_tokens:20,output_tokens:4},total_cost_usd:0.001}];\nfor (const line of lines) process.stdout.write(JSON.stringify(line)+'\\n');\n`,
    );
    await chmod(fakeCli, 0o755);
    const port = await freePort();
    const client = new Client({
      name: "glimpselet-integration",
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
      args: [join(plugin, "bin", "glimpselet.cjs")],
      cwd,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HOME: cwd,
        MOCK_ARGV_LOG: argvLog,
        GLIMPSELET_TEST_MODE: "1",
        GLIMPSELET_TEST_FIXTURE: fixturePath,
        GLIMPSELET_PORT: String(port),
        GLIMPSELET_DISABLE_BROWSER_OPEN: "1",
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
        "glimpse_channel_context",
        "glimpse_channel_ready",
        "glimpse_channel_reply",
        "panel_open",
        "screen_capture",
        "screen_clear",
        "screen_history",
        "screen_latest",
        "screen_notes",
        "screen_watch_start",
        "screen_watch_stop",
      ].sort(),
    );

    const opened = await client.callTool({ name: "panel_open", arguments: {} });
    const url = /https?:\/\/127\.0\.0\.1:\d+\/install#code=([A-F0-9]{16})/.exec(
      opened.content[0].text,
    );
    assert.ok(url, opened.content[0].text);
    assert.match(
      opened.content[0].text,
      /connects to your Claude Code automatically/,
    );
    assert.match(
      opened.content[0].text,
      /claude --continue --dangerously-load-development-channels plugin:glimpselet@glimpselet/,
    );
    const reopened = await client.callTool({
      name: "extension_install",
      arguments: {},
    });
    assert.match(reopened.content[0].text, /\/install#code=[A-F0-9]{16}/);
    assert.doesNotMatch(
      reopened.content[0].text,
      /Optional live terminal sync|--dangerously-load-development-channels/,
    );
    const panel = url[0].split("/install")[0];
    const code = url[1];
    const origin = new URL(panel).origin;
    const guide = await fetch(`${panel}/install`);
    assert.equal(guide.status, 200);
    const guideText = await guide.text();
    assert.match(guideText, /Welcome to Glimpselet/);
    assert.match(guideText, /\/install\/extension\.zip/);
    const download = await fetch(`${panel}/install/extension.zip?code=${code}`);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/zip");
    const archive = Buffer.from(await download.arrayBuffer());
    const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let offset = archive.readUInt32LE(end + 16);
    let manifest;
    for (let index = 0; index < archive.readUInt16LE(end + 10); index++) {
      assert.equal(archive.readUInt32LE(offset), 0x02014b50);
      const nameLength = archive.readUInt16LE(offset + 28);
      const name = archive.toString(
        "utf8",
        offset + 46,
        offset + 46 + nameLength,
      );
      if (name === "manifest.json") {
        const local = archive.readUInt32LE(offset + 42);
        const start =
          local +
          30 +
          archive.readUInt16LE(local + 26) +
          archive.readUInt16LE(local + 28);
        const bytes = archive.subarray(
          start,
          start + archive.readUInt32LE(offset + 20),
        );
        manifest = JSON.parse(
          (archive.readUInt16LE(offset + 10) === 8
            ? inflateRawSync(bytes)
            : bytes
          ).toString(),
        );
      }
      offset +=
        46 +
        nameLength +
        archive.readUInt16LE(offset + 30) +
        archive.readUInt16LE(offset + 32);
    }
    assert.equal(
      manifest?.version,
      version,
      "Downloaded extension must use its own package version",
    );

    const invalidExchange = await fetch(`${panel}/api/session`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid" }),
    });
    assert.equal(invalidExchange.status, 401);
    const replay = await fetch(`${panel}/api/session`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid" }),
    });
    assert.equal(replay.status, 401);
    const wrongOrigin = await fetch(`${panel}/api/clear`, {
      method: "POST",
      headers: {
        Origin: "http://example.com",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(wrongOrigin.status, 403);
    const wrongHost = await new Promise((resolveRequest, rejectRequest) => {
      const req = request(
        panel + "/api/clear",
        {
          method: "POST",
          headers: {
            Host: "localhost:1",
            Origin: origin,
            "Content-Type": "application/json",
          },
        },
        (res) => resolveRequest(res.statusCode),
      );
      req.once("error", rejectRequest);
      req.end("{}");
    });
    assert.equal(wrongHost, 403);
    const unauthenticated = await fetch(`${panel}/api/capture`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ image: `data:image/png;base64,${image()}` }),
    });
    assert.equal(unauthenticated.status, 401);

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
    assert.equal(typeof paired.liveAvailable, "boolean");
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

    socket.send(JSON.stringify({ type: "share", active: true }));
    const captureRequest = waitForMessage(socket, messages, "capture");
    const screenCapture = client.callTool({
      name: "screen_capture",
      arguments: { target: "screen" },
    });
    const requestMessage = await captureRequest;
    assert.ok(requestMessage.id);
    socket.send(
      JSON.stringify({
        type: "capture-result",
        id: requestMessage.id,
        image: `data:image/png;base64,${image()}`,
      }),
    );
    const captured = await screenCapture;
    assert.equal(captured.content[1].mimeType, "image/png");
    assert.match(captured.content[0].text, /browser/);
    const latest = await client.callTool({
      name: "screen_latest",
      arguments: {},
    });
    assert.match(latest.content[0].text, /browser/);
    const history = await client.callTool({
      name: "screen_history",
      arguments: {},
    });
    assert.match(history.content[0].text, /Explicitly shared screen/);
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
    const pendingMessage = waitForMessage(socket, messages, "capture");
    const pendingCapture = client.callTool({
      name: "screen_capture",
      arguments: { target: "screen" },
    });
    await pendingMessage;
    const stopped = await client.callTool({
      name: "screen_watch_stop",
      arguments: {},
    });
    assert.match(stopped.content[0].text, /Screen watch stopped/);
    assert.equal((await pendingCapture).isError, true);

    const answer = new Promise((resolveAnswer, rejectAnswer) => {
      const timer = setTimeout(
        () => rejectAnswer(new Error("answer timed out")),
        5_000,
      );
      const onMessage = (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type !== "done" && message.type !== "error") return;
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolveAnswer(message);
      };
      socket.on("message", onMessage);
    });
    socket.send(
      JSON.stringify({
        type: "ask",
        id: "plugin-ask",
        question: "What is visible?",
        kind: "ask",
        model: "sonnet",
        image: `data:image/png;base64,${image()}`,
      }),
    );
    const answerResult = await answer;
    assert.equal(answerResult.type, "done");
    assert.equal(answerResult.answer, "Mocked answer");
    const args = JSON.parse(
      await (await import("node:fs/promises")).readFile(argvLog, "utf8"),
    );
    assert.ok(args.includes("--output-format") && args.includes("stream-json"));
    assert.ok(args.some((arg) => arg.startsWith("Read(")));

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
