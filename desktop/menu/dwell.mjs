import { timing } from "../shared/motion.mjs";

/** The fan opens only once the pointer has stayed on Blink for a moment
 * (N2.1), so sweeping the mouse past never bursts it open. Only the pointer
 * counts: an answer, auto explain or any wake has no say. `now` is in ms. */
export function createDwell(delay = timing.menuRest) {
  let since = null,
    open = false;
  return {
    get open() {
      return open;
    },
    update(over, now) {
      if (!over) {
        since = null;
        open = false;
      } else {
        since ??= now;
        if (now - since >= delay) open = true;
      }
      return open;
    },
  };
}
