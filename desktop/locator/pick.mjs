const TEXTUAL = new Set([
  "paragraph",
  "sentence",
  "heading",
  "text",
  "cell",
  "link",
]);
const AS_KIND = {
  figure: "image",
  canvas: "image",
  button: "control",
  input: "control",
  window: "titlebar",
};
const BROWSER = /chrome|chromium|msedge|edge|brave|vivaldi|opera|firefox/i;
const PDF_APP = /evince|okular|zathura|acrobat|sumatra|preview|foxit|xreader/i;

/** Rows of a Markdown table, the separator row dropped; `\|` stays in its cell. */
export function parseTable(markdown) {
  if (!markdown) return [];
  const rows = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = [];
    let cell = "";
    for (let i = 1; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === "\\" && trimmed[i + 1] === "|") {
        cell += "|";
        i++;
      } else if (ch === "|") {
        cells.push(cell.trim());
        cell = "";
      } else cell += ch;
    }
    if (cell.trim()) cells.push(cell.trim());
    if (cells.length && cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

/** The locator, as the pick layer reads it: the element kinds the picker has
 * rungs for, the table and code content in the shape it prints, and a window
 * that says whether it is a browser or a PDF viewer. Nothing is copied back to
 * the locator, so its elements stay as it returned them.
 *
 * `settle(point)` is the click's fresh read: the picker waits for it and locks
 * when it cannot finish, because a click must not act on what was on screen a
 * moment ago. */
export function forPicker(
  locator,
  { isBrowser = (w) => BROWSER.test(w.app ?? "") } = {},
) {
  const windowOf = (w) =>
    w
      ? {
          ...w,
          ...(isBrowser(w) ? { browser: true } : {}),
          ...(PDF_APP.test(w.app ?? "") || /\.pdf\b/i.test(w.title ?? "")
            ? { pdf: true }
            : {}),
        }
      : w;

  function canonical(el) {
    if (!el) return el;
    const out = { ...el, window: windowOf(el.window) };
    if (TEXTUAL.has(el.kind)) out.kind = "text";
    else if (AS_KIND[el.kind]) out.kind = AS_KIND[el.kind];
    if (el.kind === "table")
      out.content = { ...el.content, rows: parseTable(el.content?.markdown) };
    if (el.kind === "code" && typeof el.content?.code === "string")
      out.content = {
        ...el.content,
        code: { text: el.content.code, language: el.content.language ?? "" },
      };
    return out;
  }

  return {
    locate: async (point) => canonical(await locator.locate(point)),
    parent: async (el) => canonical(await locator.parent(el)),
    elements: async (window) => (await locator.elements(window)).map(canonical),
    sentenceAt: async (el, point) =>
      canonical(await locator.sentenceAt(el, point)),
    selectionAt: (point) => locator.selectionAt(point),
    textIn: (rect) => locator.textIn(rect),
    focus: () => locator.focus(),
    windowAt: async (point) => windowOf(await locator.windowAt(point)),
    snap: (rect, options) => locator.snap(rect, options),
    invalidate: (reason) => locator.invalidate?.(reason),
    async settle(point) {
      try {
        return (await locator.refresh(point)).ok === true;
      } catch {
        return false;
      }
    },
  };
}
