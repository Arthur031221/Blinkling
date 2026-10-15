import { WORDMARK_CSS, wordmarkSvg } from "./brand/wordmark.mjs";

/** Draws the shared Wordmark into `parent`. The pages run under a strict
 * style-src, so the component's stylesheet is adopted rather than injected as a
 * <style> element (which mountWordmark would do). */
export function drawWordmark(parent, options = {}) {
  const doc = parent.ownerDocument;
  if (!doc.adoptedStyleSheets.some((sheet) => sheet.wordmark)) {
    const sheet = new doc.defaultView.CSSStyleSheet();
    sheet.replaceSync(WORDMARK_CSS);
    sheet.wordmark = true;
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  }
  const holder = doc.createElement("template");
  holder.innerHTML = wordmarkSvg(options);
  const svg = holder.content.firstElementChild;
  parent.replaceChildren(svg);
  return svg;
}
