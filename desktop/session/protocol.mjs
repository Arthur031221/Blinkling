import { randomUUID } from "node:crypto";
import { attachmentContent } from "../composer/attachments.mjs";

const attachmentTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);
/** Version-scoped protocol: proved against the host's logged-in CLI 2.1.296. */
export const compatibility = Object.freeze({
  "2.1.296": Object.freeze({
    remote: "remote_control",
    effort: "apply_flag_settings",
    canary: "2026-10-14",
    stablePublicAPI: false,
  }),
});
export const supportedClaudeVersion = "2.1.296";
export function assertClaudeVersion(version) {
  if (version.trim().split(/\s/)[0] !== supportedClaudeVersion)
    throw Object.assign(
      new Error("Unverified Claude Code protocol version: " + version.trim()),
      { code: "UNSUPPORTED_CLAUDE" },
    );
}
export function launchArguments({
  sessionId,
  newSessionId,
  model = "haiku",
  effort = "low",
} = {}) {
  return [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--replay-user-messages",
    "--name",
    "Glimpselet",
    "--model",
    model,
    "--effort",
    effort,
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--system-prompt",
    "You are Blink, a concise screen companion. Explain only: never click, type, control another app, or edit files. Do not use computer-control or editing tools. Reply in the user's language. Start with a short answer, then structured key points when useful. Preserve code and markdown.",
    "--settings",
    '{"disableAllHooks":true}',
    ...(sessionId
      ? ["--resume", sessionId]
      : newSessionId
        ? ["--session-id", newSessionId]
        : []),
  ];
}
/** GLIMPSELET_REMOTE: unset or 1 keeps the named persistent session users rely
 * on, 0 skips Remote Control entirely (every automated run), and test makes the
 * one disposable "Glimpselet test" session a job may use for its final check. */
export function remoteMode(env = process.env) {
  if (env.GLIMPSELET_REMOTE === "0") return "off";
  if (env.GLIMPSELET_REMOTE === "test") return "test";
  if (env.GLIMPSELET_REMOTE === undefined && env.GLIMPSELET_LIVE === "1")
    return "off"; // a live automated run must opt in explicitly
  return "on";
}
export function enableRemote(remoteId, mode = "on") {
  const disposable = mode === "test";
  return {
    subtype: "remote_control",
    enabled: true,
    name: disposable ? "Glimpselet test" : "Glimpselet",
    keep_session_on_exit: !disposable,
    ...(remoteId ? { reattach_session_id: remoteId } : {}),
  };
}
export function userMessage(turn, sessionId = "") {
  const attachments = turn.attachments.map((a, index) => {
    if (!attachmentTypes.has(a?.mediaType))
      throw new Error("File conversion is not implemented for this format");
    // Legacy image callers predate attachment chips. Give them stable metadata,
    // then apply the same MIME, byte and aggregate limits as the real composer.
    if (a.mediaType.startsWith("image/"))
      return {
        ...a,
        id: a.id ?? `${turn.id ?? "turn"}-image-${index}`,
        name: a.name ?? "image",
      };
    return a;
  });
  return {
    type: "user",
    uuid: turn.id,
    session_id: sessionId,
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        ...attachmentContent(attachments),
        { type: "text", text: turn.text },
      ],
    },
  };
}
export class ControlRequests {
  #pending = new Map();
  #closed = false;
  constructor(write, timeoutMs = 15000) {
    this.write = write;
    this.timeoutMs = timeoutMs;
  }
  request(request) {
    if (this.#closed)
      return Promise.reject(new Error("Claude transport closed"));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error(`Claude control timeout: ${request.subtype}`));
      }, this.timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timer });
      try {
        this.write({ type: "control_request", request_id: requestId, request });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(requestId);
        reject(error);
      }
    });
  }
  accept(event) {
    if (event.type !== "control_response") return false;
    const r = event.response;
    const pending = this.#pending.get(r?.request_id);
    if (!pending) return false;
    this.#pending.delete(r.request_id);
    clearTimeout(pending.timer);
    if (r.subtype === "success") pending.resolve(r.response ?? {});
    else
      pending.reject(new Error(r.error ?? "Claude rejected control request"));
    return true;
  }
  close() {
    this.#closed = true;
    for (const p of this.#pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Claude transport closed"));
    }
    this.#pending.clear();
  }
}
