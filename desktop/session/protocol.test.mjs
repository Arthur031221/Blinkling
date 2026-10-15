import test from "node:test";
import assert from "node:assert/strict";
import {
  ControlRequests,
  userMessage,
  launchArguments,
  enableRemote,
  remoteMode,
} from "./protocol.mjs";
test("image turns preserve image bytes and stable deduplication ID", () => {
  const value = userMessage(
    {
      id: "turn-1",
      text: "What?",
      attachments: [{ mediaType: "image/png", data: "aGVsbG8=" }],
    },
    "local",
  );
  assert.equal(value.uuid, "turn-1");
  assert.equal(value.session_id, "local");
  assert.deepEqual(value.message.content[0], {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
  });
  assert.throws(
    () => userMessage({ attachments: [{ mediaType: "application/exe" }] }),
    /not implemented/,
  );
});
test("composer PDFs and UTF-8 files reach the session as document content", () => {
  const pdf = Buffer.from("%PDF-1.7\nfixture").toString("base64");
  const text = "日本語 **notes**\nconst value = 1;";
  const value = userMessage({
    id: "files",
    text: "Explain these files.",
    attachments: [
      { id: "pdf", name: "paper.pdf", mediaType: "application/pdf", data: pdf },
      {
        id: "text",
        name: "notes.md",
        mediaType: "text/markdown",
        data: Buffer.from(text).toString("base64"),
      },
    ],
  });
  assert.deepEqual(value.message.content, [
    {
      type: "document",
      title: "paper.pdf",
      source: { type: "base64", media_type: "application/pdf", data: pdf },
    },
    {
      type: "document",
      title: "notes.md",
      source: { type: "text", media_type: "text/plain", data: text },
    },
    { type: "text", text: "Explain these files." },
  ]);
});
test("session admission rejects invalid PDF, UTF-8, base64 and overlong text", () => {
  const send = (mediaType, data) =>
    userMessage({
      id: "invalid",
      text: "Explain.",
      attachments: [{ id: "file", name: "file", mediaType, data }],
    });
  assert.throws(() => send("application/pdf", "aGVsbG8="), /Invalid PDF/);
  assert.throws(() => send("text/plain", "//8="), /encoded data/);
  assert.throws(() => send("image/png", "a=AA"), /cannot be read/);
  assert.throws(
    () =>
      send("text/plain", Buffer.from("x".repeat(200001)).toString("base64")),
    /200000 characters/,
  );
});
test("the session enforces composer count, individual and aggregate attachment limits", () => {
  const image = { mediaType: "image/png", data: "aGVsbG8=" };
  const send = (attachments) =>
    userMessage({ id: "limits", text: "", attachments });
  assert.throws(() => send(Array(9).fill(image)), /Too many attachments/);
  assert.throws(
    () =>
      send([
        { ...image, data: Buffer.alloc(21 * 1024 * 1024).toString("base64") },
      ]),
    /20 MB/,
  );
  const large = {
    ...image,
    data: Buffer.alloc(17 * 1024 * 1024).toString("base64"),
  };
  assert.throws(() => send([large, large]), /32 MB/);
});
test("owned session resumes exact ID without forking or requiring user flags", () => {
  const args = launchArguments({ sessionId: "local" });
  assert.deepEqual(args.slice(-2), ["--resume", "local"]);
  assert.ok(!args.includes("--fork-session"));
  assert.ok(!args.includes("--remote-control"));
  assert.equal(enableRemote("remote").reattach_session_id, "remote");
});

test("a permission mode reaches the launch flags only when one is given", () => {
  assert.ok(!launchArguments().includes("--permission-mode"));
  const args = launchArguments({ permissionMode: "plan" });
  assert.equal(args[args.indexOf("--permission-mode") + 1], "plan");
});

test("BLINKLING_REMOTE selects off, test or the default on", () => {
  assert.equal(remoteMode({}), "on");
  assert.equal(remoteMode({ BLINKLING_REMOTE: "1" }), "on");
  assert.equal(remoteMode({ BLINKLING_REMOTE: "0" }), "off");
  assert.equal(remoteMode({ BLINKLING_REMOTE: "test" }), "test");
  assert.deepEqual(enableRemote(undefined, "test"), {
    subtype: "remote_control",
    enabled: true,
    name: "Blinkling test",
    keep_session_on_exit: false,
  });
  assert.equal(enableRemote("remote").keep_session_on_exit, true);
});

test("owned sessions disable tools, inherited MCP and hooks and explicitly explain only", () => {
  const args = launchArguments();
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.ok(args.includes("--strict-mcp-config"));
  assert.deepEqual(JSON.parse(args[args.indexOf("--mcp-config") + 1]), {
    mcpServers: {},
  });
  assert.deepEqual(JSON.parse(args[args.indexOf("--settings") + 1]), {
    disableAllHooks: true,
  });
  assert.match(
    args[args.indexOf("--system-prompt") + 1],
    /never click, type, control another app, or edit files/,
  );
});
test("out of order responses correlate, rejection propagates, shutdown rejects pending", async () => {
  const sent = [];
  const rpc = new ControlRequests((e) => sent.push(e));
  const a = rpc.request({ subtype: "set_model" });
  const b = rpc.request({ subtype: "get_settings" });
  rpc.accept({
    type: "control_response",
    response: {
      request_id: sent[1].request_id,
      subtype: "success",
      response: { applied: { effort: "low" } },
    },
  });
  assert.deepEqual(await b, { applied: { effort: "low" } });
  rpc.accept({
    type: "control_response",
    response: {
      request_id: sent[0].request_id,
      subtype: "error",
      error: "denied",
    },
  });
  await assert.rejects(a, /denied/);
  const pending = rpc.request({ subtype: "interrupt" });
  rpc.close();
  await assert.rejects(pending, /closed/);
});
test("unanswered controls time out and late responses cannot revive them", async () => {
  const sent = [];
  const rpc = new ControlRequests((e) => sent.push(e), 10);
  await assert.rejects(rpc.request({ subtype: "remote_control" }), /timeout/);
  assert.equal(
    rpc.accept({
      type: "control_response",
      response: { request_id: sent[0].request_id, subtype: "success" },
    }),
    false,
  );
});

test("the verified CLI version is a floor inside 2.1.x, so a self-updated Claude Code works", async () => {
  const { assertClaudeVersion } = await import("./protocol.mjs");
  for (const ok of [
    "2.1.296 (Claude Code)\n",
    "2.1.301 (Claude Code)",
    "2.1.300",
  ])
    assert.doesNotThrow(() => assertClaudeVersion(ok), ok);
  for (const bad of ["2.1.295", "2.2.0", "3.0.0", "2.1", "garbage", ""])
    assert.throws(() => assertClaudeVersion(bad), /Unverified/, bad);
});

test("BLINKLING_REMOTE selects off, the one disposable test session, or the default", () => {
  assert.equal(remoteMode({}), "on");
  assert.equal(remoteMode({ BLINKLING_REMOTE: "1" }), "on");
  assert.equal(remoteMode({ BLINKLING_REMOTE: "0" }), "off");
  assert.equal(remoteMode({ BLINKLING_REMOTE: "test" }), "test");
  assert.equal(remoteMode({ BLINKLING_REMOTE: "bogus" }), "on");
  assert.equal(remoteMode({ BLINKLING_LIVE: "1" }), "off");
  assert.equal(
    remoteMode({ BLINKLING_LIVE: "1", BLINKLING_REMOTE: "test" }),
    "test",
  );
  const real = enableRemote("cse_x");
  assert.equal(real.name, "Blinkling");
  assert.equal(real.keep_session_on_exit, true);
  const disposable = enableRemote(undefined, "test");
  assert.equal(disposable.name, "Blinkling test");
  assert.equal(disposable.keep_session_on_exit, false);
  assert.throws(() => enableRemote(undefined, "off"), /disabled/);
  // End-to-end runs never touch a real account unless they ask for the test session.
  assert.equal(remoteMode({ BLINKLING_E2E: "1" }), "off");
  assert.equal(
    remoteMode({ BLINKLING_E2E: "1", BLINKLING_REMOTE: "test" }),
    "test",
  );
  assert.deepEqual(enableRemote(undefined, "on"), {
    subtype: "remote_control",
    enabled: true,
    name: "Blinkling",
    keep_session_on_exit: true,
  });
  assert.deepEqual(enableRemote("cse_x", "test"), {
    subtype: "remote_control",
    enabled: true,
    name: "Blinkling test",
    keep_session_on_exit: false,
    reattach_session_id: "cse_x",
  });
});

test("GLIMPSELET_REMOTE is the fallback for BLINKLING_REMOTE, which wins when both are set", () => {
  assert.equal(remoteMode({ GLIMPSELET_REMOTE: "0" }), "off");
  assert.equal(remoteMode({ GLIMPSELET_REMOTE: "test" }), "test");
  assert.equal(
    remoteMode({ GLIMPSELET_REMOTE: "0", BLINKLING_REMOTE: "1" }),
    "on",
  );
  assert.equal(
    remoteMode({ GLIMPSELET_REMOTE: "1", BLINKLING_E2E: "1" }),
    "on",
  );
  assert.equal(remoteMode({ BLINKLING_E2E: "1" }), "off");
  assert.equal(
    remoteMode({ GLIMPSELET_REMOTE: "1", BLINKLING_REMOTE: "0" }),
    "off",
  );
  assert.equal(
    remoteMode({ BLINKLING_E2E: "1", GLIMPSELET_REMOTE: "test" }),
    "test",
  );
});
