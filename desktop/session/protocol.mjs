import { randomUUID } from "node:crypto";
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
export function enableRemote(remoteId) {
  return {
    subtype: "remote_control",
    enabled: true,
    name: "Glimpselet",
    keep_session_on_exit: true,
    ...(remoteId ? { reattach_session_id: remoteId } : {}),
  };
}
export function userMessage(turn, sessionId = "") {
  return {
    type: "user",
    uuid: turn.id,
    session_id: sessionId,
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        ...turn.attachments.map((a) => {
          if (
            !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
              a.mediaType,
            )
          )
            throw new Error("File conversion is not implemented");
          if (
            typeof a.data !== "string" ||
            a.data.length > 28_000_000 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              a.data,
            ) ||
            !a.data.length
          )
            throw new Error("Invalid or oversized image attachment");
          return {
            type: "image",
            source: { type: "base64", media_type: a.mediaType, data: a.data },
          };
        }),
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
