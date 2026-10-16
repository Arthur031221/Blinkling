/** How Blink reacts when an answer ends: a long one is celebrated, an empty or
 * failed one gets a shrug, anything in between is left alone. */
export const LONG_ANSWER = 80;
export function reactionFor({ words = 0, failed = false } = {}) {
  if (failed || words <= 0) return "shrug";
  return words >= LONG_ANSWER ? "celebrate" : null;
}
