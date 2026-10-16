/** One normalized store for desktop turns, remote messages and replay. The chat
 * card is the only surface that shows it; when the card closes is decided by
 * the interaction machine, not here. */
export function createMessageStream() {
  const messages = new Map(),
    listeners = new Set();
  let speaking = false,
    // A turn is out and no answer text has arrived yet (the thinking wait).
    working = false,
    seeing = false,
    status = "starting";
  const snapshot = () => structuredClone([...messages.values()]);
  const state = () => ({
    messages: snapshot(),
    speaking,
    working: working && !speaking,
    seeing,
    status,
  });
  const notify = () => {
    for (const listener of listeners) listener(state());
  };
  const upsert = (message, { live = true } = {}) => {
    if (!message?.id || !["user", "assistant"].includes(message.role)) return;
    const content = Array.isArray(message.content)
      ? structuredClone(message.content)
      : [];
    messages.set(message.id, {
      id: message.id,
      role: message.role,
      content,
      text: content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n\n"),
      complete: message.complete ?? true,
      ...(message.plain ? { plain: true } : {}),
      ...(message.failure ? { failure: message.failure } : {}),
      ...(message.offer ? { offer: message.offer } : {}),
    });
    if (!live) return;
    if (message.role === "user") {
      working = true;
      seeing = content.some((b) => b.type === "image" || b.type === "document");
    } else if (messages.get(message.id).text) working = false;
  };
  return {
    append(message) {
      upsert(message);
      notify();
    },
    /** Something went wrong and Blink says so: one plain message with its
     * action chips. */
    fail({ id, text, actions = [] }) {
      upsert({
        id,
        role: "assistant",
        content: [{ type: "text", text }],
        plain: true,
        failure: { actions },
      });
      notify();
    },
    /** The reader acted on a failure (or the problem went away): drop it. */
    dismiss(id) {
      if (messages.delete(id)) notify();
    },
    snapshot,
    state,
    accept(event) {
      if (event.type === "status") status = event.state;
      else if (event.type === "sending") {
        working = true;
        seeing = Boolean(event.seeing);
      } else if (event.type === "activity") {
        if (event.state === "thinking") working = true;
        else if (["finished", "error", "idle"].includes(event.state))
          working = false;
      } else if (
        event.type === "delta" &&
        typeof event.id === "string" &&
        typeof event.text === "string"
      ) {
        if (event.replay) return;
        const old = messages.get(event.id);
        if (old?.complete) return; // Replayed deltas after the canonical message are stale.
        const text = (old?.text ?? "") + event.text;
        messages.set(event.id, {
          id: event.id,
          role: "assistant",
          text,
          content: [{ type: "text", text }],
          complete: false,
        });
        speaking = true;
        working = false;
      } else if (event.type === "message")
        upsert(event, { live: !event.replay });
      else if (event.type === "blink-say" && typeof event.text === "string")
        upsert({
          id: event.id ?? `say:${messages.size}`,
          role: "assistant",
          content: [{ type: "text", text: event.text }],
          plain: true,
        });
      else if (
        event.type === "blink-offer" &&
        typeof event.label === "string" &&
        event.label &&
        typeof event.action === "string" &&
        event.action
      )
        upsert({
          id: event.id ?? `offer:${messages.size}`,
          role: "assistant",
          content: [{ type: "text", text: event.label }],
          plain: true,
          offer: { label: event.label, action: event.action },
        });
      else if (event.type === "done") {
        for (const m of messages.values())
          if (m.role === "assistant") m.complete = true;
        speaking = false;
        working = false;
      } else return;
      notify();
    },
    /** A new chat (a pick sixty quiet seconds after the last one): the card
     * starts empty. */
    reset() {
      messages.clear();
      speaking = false;
      working = false;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state());
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
    },
  };
}
