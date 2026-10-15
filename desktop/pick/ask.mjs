import { t } from "./strings.mjs";

const IDS = ["what", "translate", "keypoints"];
/** A section or page longer than this many characters offers key points first. */
const LONG_TEXT = 600;

const count = (text, re) => (text.match(re) ?? []).length;
const WORDS = {
  en: /\b(the|and|is|are|of|to|in|that|with|for|we)\b/gi,
  de: /\b(der|die|das|und|ist|nicht|wir|ein|eine|mit|den|in)\b/gi,
  es: /\b(el|la|los|las|y|es|muy|con|para|de|que|vamos|ellos)\b/gi,
  fr: /\b(le|la|les|et|est|nous|avec|des|un|une|au|il|fait)\b/gi,
  pt: /\b(o|a|os|as|e|está|nós|com|para|de|que|eles|vamos)\b/gi,
};

/** The language of a text, from its script and then common words: zh, ja, ko,
 * en, de, es, fr, pt, or null when it cannot tell. */
export function detectLanguage(text = "") {
  const kana = count(text, /[぀-ヿ]/g);
  const hangul = count(text, /[가-힯]/g);
  const han = count(text, /[㐀-鿿]/g);
  if (kana > 0) return "ja";
  if (hangul > 0) return "ko";
  if (han > 0) return "zh";
  const letters = count(text, /\p{L}/gu);
  if (letters < 6) return null;
  const diacritics = {
    de: count(text, /[äöüß]/gi) * 2,
    es: count(text, /[ñ¿¡]/gi) * 2 + count(text, /[áíóú]/gi) * 0.5,
    fr: count(text, /[èêàçùûœ]/gi) * 1.5,
    pt: count(text, /[ãõ]/gi) * 3 + count(text, /ç/gi) * 0.5,
  };
  let best = null,
    bestScore = 0;
  for (const [language, re] of Object.entries(WORDS)) {
    // The Latin pattern is stateful; a fresh match each time keeps it pure.
    const score =
      count(text, new RegExp(re.source, re.flags)) +
      (diacritics[language] ?? 0);
    if (score > bestScore) {
      best = language;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

const baseLanguage = (locale) => locale.split("-")[0];

export function chipLabels(locale) {
  const text = t(locale);
  return IDS.map((id) => text(`chip.${id}`));
}

/** The quick-ask chips for a pick and the one Enter sends (M5, N2.9). There is
 * no placeholder sentence: the highlighted chip says what Enter will do. */
export function askModel({ items, locale }) {
  if (!items?.length)
    return { chips: [], defaultId: null, placeholder: undefined };
  const text = t(locale);
  const mine = baseLanguage(locale);
  const texts = items.filter(
    (i) => typeof i.text === "string" && i.text.trim(),
  );
  const foreign = texts.some((i) => {
    const language = detectLanguage(i.text);
    return language !== null && language !== mine;
  });
  const long = items.some(
    (i) =>
      (i.kind === "section" || i.kind === "page") &&
      (i.text ?? "").length >= LONG_TEXT,
  );
  const defaultId = foreign ? "translate" : long ? "keypoints" : "what";
  return {
    chips: IDS.map((id) => ({
      id,
      label: text(`chip.${id}`),
      prompt: text(`prompt.${id}`),
      highlighted: id === defaultId,
    })),
    defaultId,
    placeholder: undefined,
  };
}
