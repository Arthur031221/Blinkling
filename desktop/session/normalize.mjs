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
  return {
    type: "message",
    id,
    role: event.type,
    content: structuredClone(content),
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
