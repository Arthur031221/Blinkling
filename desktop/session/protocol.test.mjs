import test from "node:test";
import assert from "node:assert/strict";
import {
  ControlRequests,
  userMessage,
  launchArguments,
  enableRemote,
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
test("owned session resumes exact ID without forking or requiring user flags", () => {
  const args = launchArguments({ sessionId: "local" });
  assert.deepEqual(args.slice(-2), ["--resume", "local"]);
  assert.ok(!args.includes("--fork-session"));
  assert.ok(!args.includes("--remote-control"));
  assert.equal(enableRemote("remote").reattach_session_id, "remote");
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

test("undocumented controls require the verified CLI version", async () => {
  const { assertClaudeVersion } = await import("./protocol.mjs");
  assert.doesNotThrow(() => assertClaudeVersion("2.1.296 (Claude Code)\n"));
  assert.throws(
    () => assertClaudeVersion("2.1.297 (Claude Code)"),
    /Unverified/,
  );
});
