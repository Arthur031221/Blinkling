#!/usr/bin/env node
// Real child-process fixture. Only tests point the executable at this file.
import { createInterface } from "node:readline";
import { appendFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { transcriptPath } from "../storage.mjs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
process.env.CLAUDE_CONFIG_DIR = join(process.cwd(), ".test-claude");
import { spawn } from "node:child_process";
const args = process.argv.slice(2);
if (args.includes("--version")) {
  if (process.env.GLIMPSELET_TEST_VERSION_PID) {
    appendFileSync(
      process.env.GLIMPSELET_TEST_VERSION_PID,
      String(process.pid),
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  process.stdout.write("2.1.296 (Claude Code)\n");
  process.exit(0);
}
const localId =
  args[
    args.indexOf(args.includes("--resume") ? "--resume" : "--session-id") + 1
  ];
if (
  args.includes("--resume") &&
  !existsSync(transcriptPath(process.cwd(), localId))
) {
  process.stderr.write("No conversation found for the requested session.\n");
  process.exit(1);
}
let applied = {
  model: args[args.indexOf("--model") + 1],
  effort: args[args.indexOf("--effort") + 1],
};
const send = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
let active;
const log = (event) => {
  const file = transcriptPath(process.cwd(), localId);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(event) + "\n");
};
if (process.env.GLIMPSELET_TEST_DESCENDANT) {
  const descendant = spawn(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { stdio: "ignore" },
  );
  appendFileSync(
    process.env.GLIMPSELET_TEST_DESCENDANT,
    String(descendant.pid),
  );
  process.once("SIGTERM", () => {
    descendant.once("exit", () => process.exit(0));
    descendant.kill("SIGTERM");
  });
}
createInterface({ input: process.stdin }).on("line", (line) => {
  const frame = JSON.parse(line);
  if (frame.type === "control_request") {
    const request = frame.request;
    let response = {};
    if (request.subtype === "initialize")
      response = {
        models: [{ value: "haiku", displayName: "Haiku" }],
        nestedMarker: Boolean(process.env.CLAUDECODE),
      };
    if (request.subtype === "remote_control") {
      if (process.env.GLIMPSELET_TEST_REMOTE_LOG)
        appendFileSync(
          process.env.GLIMPSELET_TEST_REMOTE_LOG,
          `${JSON.stringify(request)}\n`,
        );
      response = {
        bridge_session_id: request.reattach_session_id ?? "cse_fixture",
        session_url: "https://claude.ai/code/session_fixture",
      };
      send({
        type: "system",
        subtype: "bridge_state",
        state: "connected",
        session_id: localId,
      });
    }
    if (request.subtype === "set_model") applied.model = request.model;
    if (request.subtype === "apply_flag_settings")
      applied.effort = request.settings.effortLevel;
    if (request.subtype === "get_settings")
      response = {
        applied,
        effective: { mustNotReachRenderer: "secret-setting" },
      };
    if (request.subtype === "interrupt" && active) {
      clearTimeout(active);
      active = undefined;
      send({
        type: "result",
        uuid: randomUUID(),
        subtype: "error_during_execution",
      });
    }
    send({
      type: "control_response",
      response: { subtype: "success", request_id: frame.request_id, response },
    });
  } else if (frame.type === "user") {
    log({ ...frame, sessionId: localId });
    send({ ...frame, isReplay: true });
    if (frame.message.content.at(-1).text === "malformed") {
      process.stdout.write("not-json\n");
      return;
    }
    active = setTimeout(() => {
      const id = `msg_${randomUUID()}`;
      send({
        type: "stream_event",
        uuid: randomUUID(),
        event: { type: "message_start", message: { id } },
      });
      send({
        type: "stream_event",
        uuid: randomUUID(),
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
      });
      send({
        type: "stream_event",
        uuid: randomUUID(),
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "OK." },
        },
      });
      const result = {
        type: "assistant",
        uuid: randomUUID(),
        parentUuid: frame.uuid,
        message: {
          id,
          content: [{ type: "text", text: "OK." }],
          stop_reason: "end_turn",
        },
      };
      log(result);
      send(result);
      send({ type: "result", uuid: randomUUID(), subtype: "success" });
      active = undefined;
    }, 25);
  }
});
