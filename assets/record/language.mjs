// The translate demo is captioned in English, so its answer has to be English.
// The recorder keeps the answer text beside the film and refuses a take whose
// answer is in another language; scripts and tests read the same rule.

const count = (text, pattern) => (text.match(pattern) ?? []).length;

/** Whether `text` reads as English: Latin letters carry it, and a few quoted
 * words of the source language (Arabic here) are allowed, but no Chinese,
 * Japanese or Korean character is. */
export function readsAsEnglish(text) {
  if (typeof text !== "string") return false;
  const latin = count(text, /[A-Za-z]/g);
  const quoted = count(text, /[؀-ۿ]/g);
  const other = count(text, /[぀-ヿ㐀-鿿가-힯]/g);
  return latin >= 40 && other === 0 && latin >= quoted * 3;
}
