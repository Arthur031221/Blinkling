/** How long after the reader's own input a scroll still counts as theirs. */
export const INPUT_WINDOW = 1200;

/** Tells a reader's scroll from the card's own. The card scrolls itself when
 * the history loads and when an answer streams in; only a scroll that follows
 * a wheel, a touch, a press or a key of the reader is reading. */
export function readerScroll(now = () => performance.now()) {
  let inputAt = -Infinity;
  return {
    input() {
      inputAt = now();
    },
    isReader() {
      return now() - inputAt < INPUT_WINDOW;
    },
  };
}
