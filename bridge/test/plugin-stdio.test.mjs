import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createServer } from "node:net";
import { request } from "node:http";
import { chmod, mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const bundle = resolve("bin/glimpselet.cjs");
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

test(
  "standalone plugin serves authenticated local panel from outside the repository",
  { timeout: 20_000 },
  async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "glimpselet-outside-"));
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
    let processClosed;
    t.after(async () => {
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
      args: [bundle],
      cwd,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
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
    const url = /https?:\/\/127\.0\.0\.1:\d+\/#([A-Za-z0-9_-]+)/.exec(
      opened.content[0].text,
    );
    assert.ok(url, opened.content[0].text);
    const panel = url[0].split("/#")[0],
      token = url[1],
      origin = new URL(panel).origin;
    const exchange = await fetch(`${panel}/api/session`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(exchange.status, 200);
    const { session } = await exchange.json();
    assert.ok(session);
    const replay = await fetch(`${panel}/api/session`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(replay.status, 401);
    const wrongOrigin = await fetch(`${panel}/api/clear`, {
      method: "POST",
      headers: {
        Origin: "http://example.com",
        Authorization: `Bearer ${session}`,
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
            Authorization: `Bearer ${session}`,
            "Content-Type": "application/json",
          },
        },
        (res) => resolveRequest(res.statusCode),
      );
      req.once("error", rejectRequest);
      req.end("{}");
    });
    assert.equal(wrongHost, 403);
    const uploaded = await fetch(`${panel}/api/capture`, {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${session}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: `data:image/png;base64,${image()}` }),
    });
    assert.equal(uploaded.status, 200);
    const latest = await client.callTool({
      name: "screen_latest",
      arguments: {},
    });
    assert.match(latest.content[0].text, /shared browser surface/);
    const socket = new WebSocket(
      `${panel.replace("http", "ws")}/api/stream`,
      ["glimpselet", session],
      { headers: { Origin: origin } },
    );
    await once(socket, "open");
    socket.send(JSON.stringify({ type: "share", active: true }));
    const captureRequest = new Promise((resolveMessage, rejectMessage) => {
      const timeout = setTimeout(
        () => rejectMessage(new Error("capture request timed out")),
        5_000,
      );
      socket.once("message", (raw) => {
        clearTimeout(timeout);
        resolveMessage(JSON.parse(raw.toString()));
      });
    });
    const screenCapture = client.callTool({
      name: "screen_capture",
      arguments: { target: "screen" },
    });
    const requestMessage = await captureRequest;
    assert.equal(requestMessage.type, "capture-request");
    socket.send(
      JSON.stringify({
        type: "capture",
        id: requestMessage.id,
        image: `data:image/png;base64,${image()}`,
      }),
    );
    const captured = await screenCapture;
    assert.equal(captured.content[1].mimeType, "image/png");
    assert.match(captured.content[0].text, /shared browser surface/);
    socket.close();
    for (let i = 0; i < 4; i++)
      assert.equal(
        (
          await fetch(`${panel}/api/capture`, {
            method: "POST",
            headers: {
              Origin: origin,
              Authorization: `Bearer ${session}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ image: image() }),
          })
        ).status,
        200,
      );
    const limited = await fetch(`${panel}/api/capture`, {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${session}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: image() }),
    });
    assert.equal(limited.status, 429);
    const answer = await fetch(`${panel}/api/ask`, {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${session}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: image(),
        question: "What is visible?",
        model: "sonnet",
      }),
    });
    assert.equal(answer.status, 200);
    const streamText = await answer.text();
    assert.match(streamText, /Mocked /);
    assert.match(streamText, /"text":"answer"/);
    const args = JSON.parse(
      await (await import("node:fs/promises")).readFile(argvLog, "utf8"),
    );
    assert.ok(args.includes("--output-format") && args.includes("stream-json"));
    assert.ok(args.some((arg) => arg.startsWith("Read(")));
    const invalid = await client.callTool({
      name: "screen_capture",
      arguments: { target: "desktop" },
    });
    assert.equal(invalid.isError, true);
    child.kill("SIGTERM");
    await processClosed;
    assert.equal(child.exitCode, 0);
  },
);
