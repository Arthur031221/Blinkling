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
  if (process.env.BLINKLING_TEST_VERSION_PID) {
    appendFileSync(process.env.BLINKLING_TEST_VERSION_PID, String(process.pid));
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  process.stdout.write(
    `${process.env.BLINKLING_TEST_CLAUDE_VERSION ?? "2.1.296"} (Claude Code)\n`,
  );
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
// Every line goes out in order, also one that is cut in two on the wire.
let wire = Promise.resolve();
const send = (event) => {
  wire = wire.then(() => process.stdout.write(`${JSON.stringify(event)}\n`));
};
const sendSplit = (event) => {
  const bytes = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
  const cut = bytes.length - 12;
  wire = wire.then(
    () =>
      new Promise((resolve) => {
        process.stdout.write(bytes.subarray(0, cut));
        setTimeout(() => {
          process.stdout.write(bytes.subarray(cut));
          resolve();
        }, 5);
      }),
  );
};
let active;
const log = (event) => {
  const file = transcriptPath(process.cwd(), localId);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(event) + "\n");
};
if (process.env.BLINKLING_TEST_DESCENDANT) {
  const descendant = spawn(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { stdio: "ignore" },
  );
  appendFileSync(process.env.BLINKLING_TEST_DESCENDANT, String(descendant.pid));
  process.once("SIGTERM", () => {
    descendant.once("exit", () => process.exit(0));
    descendant.kill("SIGTERM");
  });
}
function typedRemotely() {
  const text = process.env.BLINKLING_TEST_TYPED_REMOTELY;
  const user = randomUUID();
  const id = `msg_${randomUUID()}`;
  setTimeout(() => {
    send({
      type: "user",
      uuid: user,
      message: { role: "user", content: [{ type: "text", text }] },
    });
    const answer = {
      type: "assistant",
      uuid: randomUUID(),
      parentUuid: user,
      message: {
        id,
        content: [{ type: "text", text: `Answer to: ${text}` }],
        stop_reason: "end_turn",
      },
    };
    log(answer);
    send(answer);
    send({ type: "result", uuid: randomUUID(), subtype: "success" });
  }, 150);
}
createInterface({ input: process.stdin }).on("line", (line) => {
  const frame = JSON.parse(line);
  if (frame.type === "control_request") {
    const request = frame.request;
    if (process.env.BLINKLING_TEST_REQUESTS)
      appendFileSync(
        process.env.BLINKLING_TEST_REQUESTS,
        `${JSON.stringify(request)}\n`,
      );
    let response = {};
    if (request.subtype === "initialize")
      response = {
        models: [{ value: "haiku", displayName: "Haiku" }],
        nestedMarker: Boolean(process.env.CLAUDECODE),
      };
    if (request.subtype === "remote_control") {
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
      // A message typed in the Claude app arrives as a user event the child
      // did not get from stdin, followed by the answer to it.
      if (process.env.BLINKLING_TEST_TYPED_REMOTELY) typedRemotely();
    }
    if (request.subtype === "set_model") applied.model = request.model;
    if (request.subtype === "apply_flag_settings")
      applied.effort = request.settings.effortLevel;
    if (request.subtype === "set_permission_mode")
      response = { mode: request.mode };
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
    if (frame.message.content.at(-1).text === "limit-me") {
      // What Claude Code 2.1.x writes when the plan's usage limit is reached.
      const resetsAt =
        Number(process.env.BLINKLING_TEST_LIMIT_RESET) ||
        Math.floor(Date.now() / 1000) + 2 * 60 * 60;
      send({
        type: "rate_limit_event",
        uuid: randomUUID(),
        rate_limit_info: { status: "rejected", resetsAt },
      });
      send({
        type: "assistant",
        uuid: randomUUID(),
        error: "rate_limit",
        isApiErrorMessage: true,
        message: {
          id: `msg_${randomUUID()}`,
          content: [{ type: "text", text: "You've hit your limit" }],
          stop_reason: "stop_sequence",
        },
      });
      send({
        type: "result",
        uuid: randomUUID(),
        subtype: "success",
        is_error: true,
        result: `You've hit your limit · resets ${resetsAt}`,
      });
      return;
    }
    // "slow:" streams a few sentences over about 1.2 s, so a test can tell the
    // moment the first sentence arrives from the moment the answer ends.
    // "think:" is the same after a wait of 1.8 s before the first word.
    const think = frame.message.content.at(-1).text?.startsWith("think:");
    const slow =
      think ||
      process.env.BLINKLING_TEST_SLOW === "1" ||
      frame.message.content.at(-1).text?.startsWith("slow:");
    // "cjk:" streams words that are not ASCII, and cuts every line in the middle
    // of a character on the wire, as a pipe may.
    const cjk = frame.message.content.at(-1).text?.startsWith("cjk:");
    const pieces = cjk
      ? ["這個畫面是設定頁，", "可以改語言。", " 🙂 café ひらがな 한글"]
      : slow
        ? ["First sentence. ", "Second one ", "is longer. ", "And a third."]
        : ["OK."];
    const id = `msg_${randomUUID()}`;
    const delta = (text) =>
      (cjk ? sendSplit : send)({
        type: "stream_event",
        uuid: randomUUID(),
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        },
      });
    const finish = () => {
      const text = pieces.join("");
      const result = {
        type: "assistant",
        uuid: randomUUID(),
        parentUuid: frame.uuid,
        message: {
          id,
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
        },
      };
      log(result);
      send(result);
      send({ type: "result", uuid: randomUUID(), subtype: "success" });
      active = undefined;
    };
    const step = (index) => {
      if (index === 0) {
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
      }
      if (index === pieces.length) return finish();
      delta(pieces[index]);
      active = setTimeout(() => step(index + 1), slow ? 400 : 0);
    };
    active = setTimeout(() => step(0), think ? 1800 : 25);
  }
});
