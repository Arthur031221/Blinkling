import { timing } from "../shared/motion.mjs";

export const MAX_ITEMS = 6;

const inside = (b, p) =>
  p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;

/** The item a click at `point` grows: the most recent pick, only when the
 * click lands on the spot it covers (M4: "clicking the same picked spot
 * again grows it one level"). */
export function growTarget(items, point) {
  const last = items.at(-1);
  return last && inside(last.bounds, point) ? last : null;
}

/** The picks waiting in the mini composer, and the 60-second chat clock (K2).
 * Pure: time and ids are injected. */
export function createGroup({
  now = Date.now,
  sameChatMs = timing.sameChat,
  newId = () => crypto.randomUUID(),
} = {}) {
  let items = [];
  let chat = null;
  return {
    get items() {
      return items;
    },
    /** Picking an element that is already here keeps one chip. */
    add(item) {
      if (item.elementId && items.some((i) => i.elementId === item.elementId))
        return { ok: true };
      if (items.length >= MAX_ITEMS) return { ok: false, reason: "full" };
      items = [...items, item];
      return { ok: true };
    },
    replace(id, next) {
      items = items.map((i) => (i.id === id ? next : i));
    },
    remove(id) {
      items = items.filter((i) => i.id !== id);
    },
    clear() {
      items = [];
    },
    /** A pick or a turn happened now: same chat if the last one was within
     * the window, otherwise a new chat. */
    touchChat() {
      const t = now();
      const fresh = !chat || t - chat.at > sameChatMs;
      if (fresh) chat = { id: newId(), at: t };
      else chat.at = t;
      return { id: chat.id, fresh };
    },
  };
}
