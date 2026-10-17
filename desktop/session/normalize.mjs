export function chatMessage(event) {
  if (event.type !== "user" && event.type !== "assistant") return null;
  if (event.parent_tool_use_id || event.isMeta || !event.message) return null;
  const raw = event.message.content;
  const content = typeof raw === "string" ? [{ type: "text", text: raw }] : raw;
  if (!Array.isArray(content) || !content.length) return null;
  if (
    content.some(
      (block) => block.type === "tool_result" || block.type === "tool_use",
    )
  )
    return null;
  if (
    content.some(
      (block) =>
        block.type === "text" &&
        /^<(?:local-command-|command-name|command-message)/.test(
          block.text.trim(),
        ),
    )
  )
    return null;
  const id =
    event.type === "assistant" ? (event.message.id ?? event.uuid) : event.uuid;
  if (!id) return null;
  const at = Date.parse(event.timestamp);
  return {
    type: "message",
    id,
    role: event.type,
    content: structuredClone(content),
    ...(Number.isFinite(at) ? { at } : {}),
  };
}

/** Parent links include progress/meta records: follow them to the actual user turn. */
export function reconcileTranscript(records, state) {
  const byId = new Map(records.map((record) => [record.uuid, record]));
  const accepted = new Set();
  const completed = new Set();
  const messages = [];
  for (const record of records) {
    const message = chatMessage(record);
    if (!message) continue;
    messages.push(message);
    if (message.role === "user") accepted.add(record.uuid);
    else if (
      ["end_turn", "stop_sequence"].includes(record.message.stop_reason)
    ) {
      let parent = record.parentUuid;
      const visited = new Set();
      while (parent && !visited.has(parent)) {
        visited.add(parent);
        const ancestor = byId.get(parent);
        if (!ancestor) break;
        if (chatMessage(ancestor)?.role === "user") {
          completed.add(ancestor.uuid);
          break;
        }
        parent = ancestor.parentUuid;
      }
    }
  }
  for (const item of state.turns) {
    if (completed.has(item.turn.id)) item.state = "done";
    else if (accepted.has(item.turn.id) && item.state !== "done")
      item.state = "interrupted";
    else if (["dispatching", "accepted"].includes(item.state))
      item.state = "uncertain";
  }
  return messages;
}

const LIMIT_TEXT =
  /usage limit reached|hit your (?:usage )?limit|reached your (?:usage )?limit/i;
const toMs = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
};
function eventText(event) {
  if (typeof event.result === "string") return event.result;
  const content = event.message?.content;
  if (typeof content === "string") return content;
  return Array.isArray(content)
    ? content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join(" ")
    : "";
}
/** Claude Code signals the plan limit three ways: a `rate_limit_event` whose
 * status is "rejected" (reset time in epoch seconds), an assistant API-error
 * message with `error: "rate_limit"`, and an error result that quotes the limit,
 * sometimes as "usage limit reached|<epoch seconds>". Returns `{ resetAt }`
 * (epoch milliseconds, null when the stream did not say) or null. */
export function usageLimit(event) {
  if (event.type === "rate_limit_event") {
    const info = event.rate_limit_info ?? {};
    return info.status === "rejected" ? { resetAt: toMs(info.resetsAt) } : null;
  }
  const text = eventText(event);
  const limited =
    event.error === "rate_limit" ||
    ((event.is_error || event.isApiErrorMessage) && LIMIT_TEXT.test(text));
  if (!limited) return null;
  return { resetAt: toMs(/limit reached\|(\d{9,13})/i.exec(text)?.[1]) };
}
/** True for the stream's confirmation that requests are being accepted again. */
export function limitCleared(event) {
  return (
    (event.type === "rate_limit_event" &&
      ["allowed", "allowed_warning"].includes(event.rate_limit_info?.status)) ||
    (event.type === "result" && !event.is_error)
  );
}
