export { bubbleParts } from "./parts.mjs";
import { bubbleParts } from "./parts.mjs";
import { createCalm } from "./calm.mjs";

/** One normalized store for desktop turns, remote messages and replay. The
 * answer deck shows what arrived since the last fade; calm.mjs owns the one
 * timer that decides when that is (N6.6). */
export function createMessageStream({
  settleMs,
  quietMs, // the composer's older name for settleMs
  maxPeekParts = 7,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  const messages = new Map(),
    listeners = new Set(),
    hoverSources = new Set(),
    calm = createCalm({
      settleMs: settleMs ?? quietMs,
      now,
      setTimer: (run, ms) => {
        const id = schedule(() => {
          cancel(id); // a fired timer is released like any other
          run();
        }, ms);
        id?.unref?.();
        return () => cancel(id);
      },
    });
  let speaking = false,
    visible = false,
    floor = 0, // messages before this index belong to an answer that already faded
    status = "starting";
  const snapshot = () => structuredClone([...messages.values()]);
  const bubbles = () =>
    [...messages.values()]
      .slice(floor)
      .filter((m) => m.role === "assistant")
      .flatMap((m) => {
        if (m.offer)
          return [
            {
              kind: "offer",
              label: m.offer.label,
              action: m.offer.action,
              id: `${m.id}:0`,
              messageId: m.id,
            },
          ];
        if (m.plain)
          return [
            {
              kind: "say",
              markdown: m.text,
              complete: true,
              id: `${m.id}:0`,
              messageId: m.id,
            },
          ];
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
  /** The timer waits while Blink speaks or any surface is under the pointer. */
  const holding = () => calm.hold(speaking || hoverSources.size > 0);
  /** The last answer: everything after the last user message, or the one
   * plain line Blink said. */
  const lastAnswer = () => {
    const all = [...messages.values()];
    let start = all.length;
    while (start > 0 && all[start - 1].role === "assistant") {
      start--;
      if (all[start].plain) return start === all.length - 1 ? start : start + 1;
    }
    return start;
  };
  calm.on("fade", () => {
    visible = false;
    floor = messages.size;
    notify();
  });
  calm.on("revive", () => {
    floor = lastAnswer();
    visible = true;
    notify();
  });
  const upsert = (message, { live = true } = {}) => {
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
      ...(message.plain ? { plain: true } : {}),
      ...(message.offer ? { offer: message.offer } : {}),
    });
    if (!live) {
      floor = messages.size;
      return;
    }
    if (
      message.role === "assistant" &&
      (!old || old.text !== messages.get(message.id).text)
    ) {
      visible = true;
      calm.settle(message.id);
    }
  };
  return {
    append(message) {
      upsert(message);
      holding();
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
        visible = true;
        calm.settle(event.id);
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
        if (calm.turnId !== undefined) calm.settle(event.turnId ?? calm.turnId);
      } else return;
      holding();
      notify();
    },
    /** Idempotent: the shell repeats it with every pointer move. Entering
     * brings the last answer back; leaving hands the timer back to calm. */
    hover(value, source = "blink") {
      const had = hoverSources.has(source);
      if (value) hoverSources.add(source);
      else hoverSources.delete(source);
      if (Boolean(value) === had) return;
      holding();
      if (value && source !== "bubbles") calm.hover();
    },
    pin: (on) => calm.pin(on),
    /** Blink moved to another display; its answers stay behind. */
    leaveDisplay() {
      calm.leave();
    },
    /** A new chat (a pick sixty quiet seconds after the last one): the deck
     * starts empty and the old answers are not brought back by hovering. */
    reset() {
      messages.clear();
      floor = 0;
      speaking = false;
      visible = false;
      calm.leave();
      holding();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state());
      return () => listeners.delete(listener);
    },
    dispose() {
      calm.dispose();
      listeners.clear();
    },
  };
}
