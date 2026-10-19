/** Blink's mutter: the one or two sentences it says to itself about the
 * screen, in a small bubble beside its mouth. It shows while the answer
 * streams, stays for a reading time after the last word and goes away by
 * itself, by a click on the background, or when the card opens. */
export const MUTTER_MIN_MS = 6000;
export const MUTTER_MAX_MS = 20000;
/** An answer that never finishes does not stay either. */
export const MUTTER_PARTIAL_MS = 20000;
const CJK = /[⺀-鿿가-힯＀-￯]/g;
/** Reading time: a word is about a third of a second, a CJK character about
 * a fifth of one, plus a moment to notice the bubble. */
export function mutterTime(text) {
  const characters = (text.match(CJK) ?? []).length;
  const words = text.replace(CJK, " ").split(/\s+/).filter(Boolean).length;
  return Math.min(
    MUTTER_MAX_MS,
    Math.max(MUTTER_MIN_MS, 2500 + words * 330 + characters * 200),
  );
}
export function createMutter({
  node,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
}) {
  let timer = null;
  const hide = () => {
    if (timer !== null) cancel(timer);
    timer = null;
    node.dataset.shown = "false";
  };
  return {
    hide,
    get shown() {
      return node.dataset.shown === "true";
    },
    /** One `mutter` event from main: the words so far, or the final answer. */
    accept({ text = "", final = false }) {
      const words = String(text).trim();
      if (!words) return hide();
      // textContent only: whatever the model wrote is text, never markup.
      node.textContent = words;
      node.dataset.shown = "true";
      if (timer !== null) cancel(timer);
      timer = schedule(hide, final ? mutterTime(words) : MUTTER_PARTIAL_MS);
    },
  };
}
