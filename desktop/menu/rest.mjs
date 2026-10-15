import { timing } from "../shared/motion.mjs";
/** The fan opens only after the pointer has rested on Blink (N2.1); passing
 * by, or Blink waking for an answer, never opens it. `keep` says the pointer
 * is over one of the fan's own bubbles, which holds the fan open. */
export function createRest(delay = timing.menuRest) {
  let since = null,
    ready = false;
  return {
    get ready() {
      return ready;
    },
    update(over, now, { keep = false } = {}) {
      if (over) {
        since ??= now;
        if (now - since >= delay) ready = true;
      } else {
        since = null;
        if (!keep) ready = false;
      }
      return ready;
    },
  };
}
