/** The three quick-ask chips and the default ask (N1.3). The chip Enter would
 * send is shown highlighted, so the default is just one of the three. */
export const CHIPS = Object.freeze(["what", "translate", "points"]);

const SCRIPTS = [
  ["kana", /[぀-ヿ]/u],
  ["hangul", /[가-힯ᄀ-ᇿ]/u],
  ["han", /[㐀-鿿]/u],
  ["cyrillic", /[Ѐ-ӿ]/u],
  ["arabic", /[؀-ۿ]/u],
  ["latin", /[A-Za-zÀ-ɏ]/u],
];

/** The dominant script of a text, or null when it has no letters. */
export function scriptOf(text) {
  const sample = String(text ?? "").slice(0, 2000);
  const counts = new Map();
  for (const ch of sample)
    for (const [name, re] of SCRIPTS)
      if (re.test(ch)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
        break;
      }
  // Japanese text mixes kana with kanji: one kana makes the whole text ja.
  if (counts.get("kana")) return "kana";
  let best = null;
  for (const [name, n] of counts) if (!best || n > counts.get(best)) best = name;
  return best;
}

const LOCALE_SCRIPTS = {
  "zh-TW": ["han"],
  "zh-CN": ["han"],
  ja: ["kana", "han"],
  ko: ["hangul"],
};

/** True when the text is written in a different script than the user's
 * language. Latin against Latin is never guessed: no model call for a default. */
export function isForeign(text, locale) {
  const script = scriptOf(text);
  if (!script) return false;
  return !(LOCALE_SCRIPTS[locale] ?? ["latin"]).includes(script);
}

const LONG_TEXT = 600;
const WHOLE = new Set(["section", "page"]);

/** Which chip Enter sends for this pick. */
export function defaultChip(taken, locale) {
  const text = taken.text ?? "";
  if (text && isForeign(text, locale)) return "translate";
  if (WHOLE.has(taken.kind) && text.length >= LONG_TEXT) return "points";
  return "what";
}

const LANGUAGE = {
  en: "English",
  "zh-TW": "Traditional Chinese",
  "zh-CN": "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  de: "German",
  es: "Spanish",
  fr: "French",
  "pt-BR": "Brazilian Portuguese",
};
export const languageName = (locale) => LANGUAGE[locale] ?? LANGUAGE.en;

const IMAGE_LIKE = new Set(["image", "chart", "video", "control", "area", "screen", "window"]);

/** The question behind a chip. It only asks Claude to explain; the session adds
 * the explain-only safety line (K5). */
export function promptFor(chip, taken, locale) {
  const language = languageName(locale);
  const reply = `Answer in ${language}.`;
  if (chip === "translate")
    return `Translate this into ${language}, keeping the meaning and tone. ${reply}`;
  if (chip === "points")
    return `Give the key points of this in a few short lines. ${reply}`;
  return IMAGE_LIKE.has(taken.kind)
    ? `What is this? ${reply}`
    : `Explain this simply. ${reply}`;
}
