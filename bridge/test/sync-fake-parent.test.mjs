import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startDesktopHost } from "../../plugin/desktop/host.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (check, ms = 8000) => {
  for (let t = 0; t < ms; t += 50) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error("Timed out waiting for the mirror");
};

/** The terminal's Claude Code, played by a test: it loads the plugin's MCP
 * server as a channel, listens for channel events and runs the hook script. */
test(
  "a fake parent session receives Blink's chat as channel events and sends its own turns to Blink",
  { timeout: 40_000 },
  async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), "blinkling-sync-"));
    const runtime = join(cwd, "runtime");
    await mkdir(runtime, { recursive: true, mode: 0o700 });
    // What the shell does with a mirrored line, and Blink's own chat.
    const listeners = new Set();
    const session = {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const emit = (event) => listeners.forEach((l) => l(event));
    const mirrored = [];
    const host = await startDesktopHost({
      directory: runtime,
      descriptor: join(runtime, "desktop.json"),
      session,
      onMirror: (line) => {
        mirrored.push(line);
        emit({
          type: "message",
          id: `terminal-${line.id}`,
          role: line.role,
          origin: "terminal",
          content: [{ type: "text", text: line.text }],
        });
      },
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
        command: process.execPath,
        args: [resolve("bin", "blinkling.cjs")],
        cwd,
        env: {
          ...process.env,
          HOME: cwd,
          BLINKLING_TEST_MODE: "1",
          BLINKLING_PORT: "0",
          BLINKLING_RUNTIME_DIR: runtime,
          BLINKLING_DISABLE_BROWSER_OPEN: "1",
        },
      }),
    );

    // The server says it is a channel and says what its events mean.
    assert.deepEqual(parent.getServerCapabilities().experimental, {
      "claude/channel": {},
    });
    assert.match(parent.getInstructions(), /mirror a chat held in Blink/);
    assert.match(parent.getInstructions(), /do not reply/);

    // Wait for the server to start listening to Blink, then talk in Blink.
    let probe = 0;
    await until(() => {
      if (!events.length)
        emit({
          type: "message",
          id: `probe-${probe++}`,
          role: "user",
          content: [{ type: "text", text: "probe" }],
        });
      return events.length > 0;
    });
    events.length = 0;
    emit({
      type: "message",
      id: "u1",
      role: "user",
      content: [{ type: "text", text: "what is on my screen?" }],
    });
    emit({
      type: "message",
      id: "a1",
      role: "assistant",
      content: [{ type: "text", text: "A spreadsheet." }],
    });
    emit({ type: "delta", id: "a1", text: " more" });
    emit({ type: "done", turnId: "u1" });
    await until(() => events.length >= 2);
    assert.deepEqual(
      events.map((e) => [e.meta.role, e.content]),
      [
        ["user", "what is on my screen?"],
        ["assistant", "A spreadsheet."],
      ],
    );

    // The terminal types and is answered: the hook script sends both to Blink.
    await writeFile(
      join(runtime, "sessions.json"),
      JSON.stringify([{ id: "sess-1", at: Date.now() }]),
    );
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
    const quiet = await hook({
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-1",
      prompt: "fix the build",
    });
    assert.deepEqual(quiet, { stdout: "", stderr: "" });
    await hook({
      hook_event_name: "Stop",
      session_id: "sess-1",
      last_assistant_message: "The build is fixed.",
    });
    // A session that did not open Blink is not mirrored.
    await hook({
      hook_event_name: "UserPromptSubmit",
      session_id: "someone-else",
      prompt: "private",
    });
    assert.deepEqual(
      mirrored.map((m) => [m.role, m.text]),
      [
        ["user", "fix the build"],
        ["assistant", "The build is fixed."],
      ],
    );
    // They were shown in Blink and did not come back to the terminal.
    emit({
      type: "message",
      id: "u2",
      role: "user",
      content: [{ type: "text", text: "and now?" }],
    });
    await until(() => events.length >= 3);
    await sleep(300);
    assert.deepEqual(
      events.slice(2).map((e) => e.content),
      ["and now?"],
    );
  },
);
