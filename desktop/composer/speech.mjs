/** Reading an answer aloud with the system voices (speechSynthesis). One thing
 * is read at a time; starting another, or the same again, stops the first. */
export function spokenText(root) {
  const copy = root.cloneNode(true);
  // Code and reference badges are not sentences.
  for (const n of copy.querySelectorAll(".gl-code, .gl-ref, .gl-message-meta"))
    n.remove();
  // Paragraphs, items and rows are separate sentences.
  for (const n of copy.querySelectorAll(
    "p, li, h1, h2, h3, h4, h5, h6, blockquote, tr, br",
  ))
    n.append(" ");
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}
export function pickVoice(voices, locale) {
  const want = locale.toLowerCase(),
    base = want.split("-")[0];
  const lang = (v) =>
    String(v.lang ?? "")
      .toLowerCase()
      .replace("_", "-");
  return (
    voices.find((v) => lang(v) === want) ??
    voices.find((v) => lang(v).split("-")[0] === base)
  );
}
export function createSpeaker(win, locale, { wait = 1000 } = {}) {
  let current = null;
  const stop = () => {
    const was = current;
    current = null;
    if (was) {
      win.speechSynthesis?.cancel();
      was.end();
    }
    return Boolean(was);
  };
  /** Voices arrive after the first call on some systems: wait for them once. */
  const voices = (synth) =>
    new Promise((resolve) => {
      const now = synth.getVoices();
      if (now.length) return resolve(now);
      const timer = win.setTimeout(() => resolve(synth.getVoices()), wait);
      synth.addEventListener?.(
        "voiceschanged",
        () => {
          win.clearTimeout(timer);
          resolve(synth.getVoices());
        },
        { once: true },
      );
    });
  return {
    reading: (key) => current?.key === key,
    stop,
    /** Resolves "started", "stopped" (it was reading this one) or "unavailable". */
    async toggle(key, text, end = () => {}) {
      const synth = win.speechSynthesis;
      if (!synth || !win.SpeechSynthesisUtterance) return "unavailable";
      const same = current?.key === key;
      stop();
      if (same) return "stopped";
      const available = await voices(synth);
      if (!available.length || !text) return "unavailable";
      const utterance = new win.SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      const voice = pickVoice(available, locale);
      try {
        if (voice) utterance.voice = voice;
      } catch {
        // The language alone then picks the voice.
      }
      const mine = { key, end };
      current = mine;
      const over = () => {
        if (current === mine) {
          current = null;
          end();
        }
      };
      utterance.onend = over;
      utterance.onerror = over;
      synth.speak(utterance);
      return "started";
    },
  };
}
