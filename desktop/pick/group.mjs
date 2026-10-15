import { randomUUID } from "node:crypto";
import { timing } from "../shared/motion.mjs";

/** Picks and captures within 60 s of each other share one chat (K2, M5); a
 * later one starts a new chat. The window slides with every pick. */
export function createGrouper({
  clock = Date.now,
  window = timing.sameChat,
  uuid = randomUUID,
} = {}) {
  let id = null,
    last = -Infinity;
  const open = () => id !== null && clock() - last <= window;
  return {
    join() {
      const fresh = !open();
      if (fresh) id = uuid();
      last = clock();
      return { chatId: id, fresh };
    },
    /** The chat that is still open, without extending it. */
    peek: () => (open() ? id : null),
    current: () => id,
    reset() {
      id = null;
      last = -Infinity;
    },
  };
}
