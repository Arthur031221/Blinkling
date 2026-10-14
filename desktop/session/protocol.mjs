import { randomUUID } from "node:crypto";
/** Version-scoped protocol: proved against the host's logged-in CLI 2.1.296. */
export const supportedClaudeVersion = "2.1.296";
export function assertClaudeVersion(version) {
  if (version.trim().split(/\s/)[0] !== supportedClaudeVersion)
    throw new Error(
      "Unverified Claude Code protocol version: " + version.trim(),
    );
}
export function launchArguments({
  sessionId,
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
    ...(sessionId ? ["--resume", sessionId] : []),
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
  constructor(write, timeoutMs = 15000) {
    this.write = write;
    this.timeoutMs = timeoutMs;
  }
  request(request) {
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
    for (const p of this.#pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Claude transport closed"));
    }
    this.#pending.clear();
  }
}
