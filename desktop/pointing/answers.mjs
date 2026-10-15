import { parseRefs } from "../messages/refs.mjs";

const isScreenQuestion = (turn) =>
  ["composer", "quick-ask"].includes(turn?.source) &&
  turn.attachments?.some((a) => a?.mediaType?.startsWith("image/"));

const textOf = (message) =>
  (message.content ?? [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("");

/** The shell's side of M3: a question about the screen carries the element
 * list, and the answer to it is drawn as marks once it is complete.
 * `display()` is the display Blink is on; `window()` the window the question
 * is about (what the locator's `elements` is asked for). */
export function createAnswerPointing({ pointing, display, window }) {
  const asked = new Map();
  let latest = null;

  return {
    /** The turn to send: a screen question gets the instructions appended. */
    async ask(turn) {
      pointing.clear("new-question");
      latest = null;
      if (!isScreenQuestion(turn)) return turn;
      const target = await window();
      const text = await pointing.instructions(target);
      asked.set(turn.id, { window: target, answers: new Map() });
      return text ? { ...turn, text: `${turn.text}${text}` } : turn;
    },
    /** Session events, as the shell sees them. Resolves when a finished
     * answer has been drawn (or found to name nothing). */
    async event(event) {
      if (event?.type === "message" && event.role === "assistant") {
        asked.forEach((turn) => turn.answers.set(event.id, textOf(event)));
        return false;
      }
      if (event?.type !== "done" || !asked.has(event.turnId)) return false;
      const turn = asked.get(event.turnId);
      asked.delete(event.turnId);
      const refs = parseRefs([...turn.answers.values()].join("\n"));
      if (!refs.length) return false;
      const shown = display();
      const { width, height } = shown.bounds;
      const capture = {
        display: shown,
        region: { x: 0, y: 0, width, height },
        pixelWidth: Math.round(width * shown.scaleFactor),
        pixelHeight: Math.round(height * shown.scaleFactor),
      };
      latest = refs;
      return pointing.show(refs, {
        displayId: shown.id,
        capture,
        window: turn.window,
        snap: true,
      });
    },
    /** The ref the bubbles know mark `n` by, for a click on the mark. */
    refOf(n) {
      return latest?.find((r) => r.n === n)?.ref ?? null;
    },
  };
}
