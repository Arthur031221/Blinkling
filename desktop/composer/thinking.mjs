import { timing } from "../shared/motion.mjs";

/** The wait before an answer: three dots and an English -ing word that changes
 * while Claude works, in the manner of Claude's own interface. The words are
 * English in every locale on purpose; only the accessible label is translated. */
export const WORDS = Object.freeze([
  "Thinking",
  "Pondering",
  "Reading the screen",
  "Working it out",
  "Mulling it over",
  "Writing",
]);
/** A turn that carries a picture starts on the screen. */
const SEEING = "Reading the screen";

/** The word shown `elapsed` ms into the wait, one every `every` ms. */
export function wordAt(
  elapsed,
  { seeing = false, every = timing.thinkWord } = {},
) {
  const start = seeing ? WORDS.indexOf(SEEING) : 0;
  const step = Math.max(0, Math.floor(elapsed / every));
  return WORDS[(start + step) % WORDS.length];
}

/** The indicator element. `start()` shows it and begins the rotation, `stop()`
 * removes the timer; the node stays in the document hidden, so showing it again
 * is a class change and not a rebuild. */
export function mountThinking(
  host,
  {
    label,
    every = timing.thinkWord,
    now = () => performance.now(),
    schedule = setInterval,
    cancel = clearInterval,
  } = {},
) {
  const doc = host.ownerDocument;
  const root = doc.createElement("div");
  root.className = "gl-thinking";
  root.setAttribute("role", "status");
  root.setAttribute("aria-label", label);
  root.hidden = true;
  const dots = doc.createElement("span");
  dots.className = "gl-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) dots.append(doc.createElement("i"));
  const word = doc.createElement("span");
  word.className = "gl-think-word";
  word.setAttribute("aria-hidden", "true");
  const spelled = doc.createElement("span");
  // A lighter copy of the word, drawn by the style sheet, sweeps across it.
  const glint = doc.createElement("span");
  glint.className = "gl-think-glint";
  word.append(spelled, glint);
  root.append(dots, word);
  host.append(root);
  let timer = null,
    began = 0,
    seeing = false;
  const show = () => {
    const next = wordAt(now() - began, { seeing, every });
    if (spelled.textContent !== next) {
      spelled.textContent = next;
      glint.dataset.word = next;
    }
  };
  return {
    element: root,
    get running() {
      return timer !== null;
    },
    start({ seeing: sees = false } = {}) {
      if (timer !== null) return;
      seeing = sees;
      began = now();
      show();
      root.hidden = false;
      timer = schedule(show, Math.min(every, 600));
    },
    stop() {
      if (timer !== null) cancel(timer);
      timer = null;
      root.hidden = true;
    },
    dispose() {
      this.stop();
      root.remove();
    },
  };
}
