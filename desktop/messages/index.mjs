export { bubbleParts } from "./parts.mjs";
import { bubbleParts } from "./parts.mjs";

/** One normalized store for desktop turns, remote messages and replay. */
export function createMessageStream({
  quietMs = 6500,
  maxPeekParts = 7,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  const messages = new Map(),
    listeners = new Set(),
    hoverSources = new Set();
  let speaking = false,
    visible = false,
    timer,
    status = "starting",
    activity = now();
  const snapshot = () => structuredClone([...messages.values()]);
  const bubbles = () =>
    [...messages.values()]
      .filter((m) => m.role === "assistant")
      .flatMap((m) => {
        const parts = bubbleParts(m.text, m.complete).map((p, i) => ({
          ...p,
          id: `${m.id}:${i}`,
          messageId: m.id,
        }));
        const images = m.content
          .filter((b) => b.type === "image")
          .map((b, i) => ({
            kind: "image",
            id: `${m.id}:image:${i}`,
            messageId: m.id,
            image: b,
          }));
        const result = [...parts, ...images];
        if (parts.length > maxPeekParts || m.text.length > 900)
          result.push({
            kind: "open-chat",
            id: `${m.id}:chat`,
            messageId: m.id,
          });
        return result;
      });
  const state = () => ({
    messages: snapshot(),
    bubbles: bubbles(),
    speaking,
    visible,
    status,
  });
  const notify = () => {
    for (const listener of listeners) listener(state());
  };
  const clearTimer = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const quiet = () => {
    clearTimer();
    if (hoverSources.size || speaking || !visible) return;
    timer = schedule(() => {
      cancel(timer);
      timer = undefined;
      if (!hoverSources.size && !speaking && now() - activity >= quietMs) {
        visible = false;
        notify();
      }
    }, quietMs);
    timer?.unref?.();
  };
  const touch = () => {
    activity = now();
    visible = true;
    clearTimer();
  };
  const upsert = (message) => {
    if (!message?.id || !["user", "assistant"].includes(message.role)) return;
    const old = messages.get(message.id);
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
    });
    if (
      message.role === "assistant" &&
      (!old || old.text !== messages.get(message.id).text)
    )
      touch();
  };
  return {
    append(message) {
      upsert(message);
      quiet();
      notify();
    },
    snapshot,
    bubbles,
    state,
    accept(event) {
      if (event.type === "status") status = event.state;
      else if (
        event.type === "delta" &&
        typeof event.id === "string" &&
        typeof event.text === "string"
      ) {
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
        touch();
      } else if (event.type === "reset") {
        // A new chat (sixty quiet seconds after the last pick): the display starts empty.
        messages.clear();
        speaking = false;
        visible = false;
        clearTimer();
      } else if (event.type === "message") upsert(event);
      else if (event.type === "done") {
        for (const m of messages.values())
          if (m.role === "assistant") m.complete = true;
        speaking = false;
        activity = now();
      } else return;
      quiet();
      notify();
    },
    hover(value, source = "blink") {
      if (value) hoverSources.add(source);
      else hoverSources.delete(source);
      if (hoverSources.size && messages.size) touch();
      else activity = now();
      quiet();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state());
      return () => listeners.delete(listener);
    },
    dispose() {
      clearTimer();
      listeners.clear();
    },
  };
}
