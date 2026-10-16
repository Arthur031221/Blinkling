import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startDesktopHost } from "../../plugin/desktop/host.mjs";
import { ChannelChat, ChatRouter } from "../../desktop/session/router.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (check, ms = 8000) => {
  for (let t = 0; t < ms; t += 50) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error("Timed out waiting");
};
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** The terminal's Claude Code, played by a test: a process whose command line
 * carries the channel flag, which loads the plugin's MCP server as a channel,
 * shows its events as the exact `<channel source="plugin:blinkling:blinkling">`
 * prompt a real install produces, and runs the hook script. */
async function fakeSession(t, { flag, id }) {
  const cwd = await mkdtemp(join(tmpdir(), "blinkling-sync-"));
  const runtime = join(cwd, "runtime");
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const main = {
    state: { messages: [] },
    subscribe(listener) {
      listener({ type: "status", state: "connected" });
      return () => {};
    },
    emit() {},
    send: async () => {},
    connect: async () => {},
  };
  const router = new ChatRouter({
    main,
    makeBridge: () => ({
      state: { messages: [] },
      subscribe: () => () => {},
      emit() {},
      send: async () => {},
    }),
    makeChannel: (session) =>
      new ChannelChat({
        directory: join(cwd, "chats", session),
        settleMs: 20,
        deliver: (frame) => host.toSession(session, frame),
      }),
  });
  const seen = [];
  router.subscribe((e) => seen.push(e), { visible: true });
  const host = await startDesktopHost({
    directory: runtime,
    descriptor: join(runtime, "desktop.json"),
    session: main,
    onLink: (link) => router.link(link),
    onUnlink: (link) => router.unlink(link.session),
    onReply: (reply) => router.reply(reply),
    onTurnEnd: (end) => router.turnEnd(end),
    chatImages: async ({ session }) => router.images(session),
    onMirror: (line) => router.mirror(line),
  });
  const events = [];
  const parent = new Client(
    { name: "fake-claude-code", version: "1.0.0" },
    { capabilities: { experimental: {} } },
  );
  parent.fallbackNotificationHandler = async (n) => {
    if (n.method === "notifications/claude/channel") events.push(n.params);
  };
  t.after(async () => {
    await parent.close().catch(() => {});
    await host.close?.();
    await rm(cwd, { recursive: true, force: true });
  });
  await parent.connect(
    new StdioClientTransport({
      // The stand in for the claude process: its command line is what the
      // server reads, and the server is its child on the same pipes.
      command: process.execPath,
      args: [
        "-e",
        `const c = require("node:child_process").spawn(process.execPath, [${JSON.stringify(resolve("bin", "blinkling.cjs"))}], { stdio: "inherit" }); c.on("exit", (code) => process.exit(code ?? 0)); for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => { c.kill(); process.exit(0); });`,
        "--",
        ...(flag
          ? [
              "--dangerously-load-development-channels",
              "plugin:blinkling@blinkling",
            ]
          : []),
      ],
      cwd,
      env: {
        ...process.env,
        HOME: cwd,
        BLINKLING_TEST_MODE: "1",
        BLINKLING_PORT: "0",
        BLINKLING_RUNTIME_DIR: runtime,
        BLINKLING_DISABLE_BROWSER_OPEN: "1",
        CLAUDE_CODE_SESSION_ID: id,
        CLAUDE_PID: String(process.pid),
        CLAUDE_PROJECT_DIR: join(cwd, "alpha"),
      },
    }),
  );
  await until(() => host.links().some((l) => l.session === id));
  const hook = (payload) =>
    new Promise((done, fail) => {
      const child = execFile(
        process.execPath,
        [resolve("plugin", "desktop", "mirror.mjs")],
        { env: { ...process.env, BLINKLING_RUNTIME_DIR: runtime } },
        (error, stdout, stderr) =>
          error ? fail(error) : done({ stdout, stderr }),
      );
      child.stdin.end(JSON.stringify(payload));
    });
  await writeFile(
    join(runtime, "sessions.json"),
    JSON.stringify([{ id, at: Date.now() }]),
  );
  const promptOf = (e) =>
    `<channel source="plugin:blinkling:blinkling" kind="${e.meta.kind}" turn="${e.meta.turn ?? ""}">${e.content}</channel>`;
  return { router, host, parent, events, seen, hook, promptOf, runtime };
}

test(
  "a session started with the flag answers Blink's chat itself: one user bubble, one answer, no markup, pictures reach it",
  { timeout: 40_000 },
  async (t) => {
    const s = await fakeSession(t, { flag: true, id: "sess-1" });
    assert.deepEqual(s.parent.getServerCapabilities().experimental, {
      "claude/channel": {},
    });
    assert.match(s.parent.getInstructions(), /blinkling_reply/);
    assert.equal(s.host.links()[0].channel, true);
    const tools = (await s.parent.listTools()).tools.map((x) => x.name);
    assert.ok(tools.includes("blinkling_reply"));
    assert.ok(tools.includes("blinkling_chat_images"));

    const turnId = randomUUID();
    await s.router.send({
      id: turnId,
      source: "composer",
      text: "what is on my screen?",
      attachments: [
        { id: "p", name: "shot.png", mediaType: "image/png", data: PNG },
      ],
    });
    await until(() => s.events.length >= 1);
    assert.equal(s.events[0].meta.kind, "question");
    assert.equal(s.events[0].meta.turn, turnId);
    assert.match(s.events[0].content, /what is on my screen\?/);
    assert.match(s.events[0].content, /blinkling_chat_images/);

    // The terminal Claude looks at the picture and answers through the tool.
    const images = await s.parent.callTool({
      name: "blinkling_chat_images",
      arguments: {},
    });
    assert.equal(images.content[0].type, "image");
    assert.equal(images.content[0].mimeType, "image/png");
    assert.equal(images.content[0].data, PNG);
    // Its own prompt hook sees the channel text and does not send it back.
    await s.hook({
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-1",
      prompt: s.promptOf(s.events[0]),
    });
    const sent = await s.parent.callTool({
      name: "blinkling_reply",
      arguments: { text: "A spreadsheet.", turn: turnId },
    });
    assert.notEqual(sent.isError, true);
    // The quiet line it writes in the terminal afterwards is not an answer.
    await s.hook({
      hook_event_name: "Stop",
      session_id: "sess-1",
      last_assistant_message: "Blink's reply was sent.",
    });
    await sleep(100);
    const messages = s.seen.filter((e) => e.type === "message");
    assert.deepEqual(
      messages.map((m) => [
        m.role,
        m.content.find((b) => b.type === "text").text,
      ]),
      [
        ["user", "what is on my screen?"],
        ["assistant", "A spreadsheet."],
      ],
    );
    for (const m of messages)
      for (const b of m.content)
        assert.doesNotMatch(b.text ?? "", /<channel|plugin:blinkling|chat_id/);
    assert.equal(s.seen.filter((e) => e.type === "done").length, 1);
  },
);

test(
  "an answer written as plain text still reaches Blink once from the Stop hook, and terminal typing joins the chat",
  { timeout: 40_000 },
  async (t) => {
    const s = await fakeSession(t, { flag: true, id: "sess-2" });
    await s.router.send({
      id: randomUUID(),
      source: "composer",
      text: "explain this",
      attachments: [],
    });
    await until(() => s.events.length >= 1);
    await s.hook({
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-2",
      prompt: s.promptOf(s.events[0]),
    });
    await s.hook({
      hook_event_name: "Stop",
      session_id: "sess-2",
      last_assistant_message: "It is a login page.",
    });
    await s.hook({
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-2",
      prompt: "typed in the terminal",
    });
    await sleep(100);
    const lines = s.seen
      .filter((e) => e.type === "message")
      .map((m) => [m.role, m.content[0].text]);
    assert.deepEqual(lines, [
      ["user", "explain this"],
      ["assistant", "It is a login page."],
      ["user", "typed in the terminal"],
    ]);
  },
);

test(
  "a session without the flag is linked without a channel and Blink sends it no events",
  { timeout: 40_000 },
  async (t) => {
    const s = await fakeSession(t, { flag: false, id: "sess-3" });
    assert.equal(s.host.links()[0].channel, false);
    assert.equal(
      s.host.toSession("sess-3", { type: "turn", text: "x" }),
      false,
    );
    const refused = await s.parent.callTool({
      name: "blinkling_reply",
      arguments: { text: "hello" },
    });
    assert.equal(refused.isError, true);
    await sleep(200);
    assert.equal(s.events.length, 0);
  },
);
