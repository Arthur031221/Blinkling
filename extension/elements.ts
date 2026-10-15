/** Describes what is on the page, as plain data, for Blink's locator. Runs in the
 * page's isolated world; it only reads the DOM. Secret fields are reported as
 * `secure` with no name, text or content, whatever they hold. */
export type ElementKind =
  | "paragraph"
  | "heading"
  | "image"
  | "figure"
  | "table"
  | "code"
  | "formula"
  | "video"
  | "canvas"
  | "link"
  | "button"
  | "input";
export type ElementContent = {
  markdown?: string;
  code?: string;
  language?: string;
  latex?: string;
  mathml?: string;
};
export type CollectedElement = {
  id: string;
  kind: ElementKind;
  rect: { x: number; y: number; width: number; height: number };
  role: string;
  name: string;
  text: string;
  parentId?: string;
  secure: boolean;
  content?: ElementContent;
};

export const MAX_ELEMENTS = 600;
const TEXT = 2000,
  NAME = 300,
  MARKDOWN = 20_000,
  CODE = 20_000,
  LATEX = 4000,
  MATHML = 8000;

const SELECTOR = [
  "h1,h2,h3,h4,h5,h6,[role=heading]",
  "p,blockquote,dd,dt,summary,li",
  "img,picture,svg[role=img]",
  "figure",
  "table",
  "pre",
  "math,mjx-container,.katex,.MathJax",
  "video",
  "canvas",
  "a[href]",
  "button,[role=button],input,textarea,select",
  ".pdf-text-layer > span",
].join(",");

const IMPLICIT_ROLE: Record<string, string> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  p: "paragraph",
  blockquote: "blockquote",
  li: "listitem",
  dd: "definition",
  dt: "term",
  summary: "button",
  img: "img",
  picture: "img",
  figure: "figure",
  table: "table",
  pre: "code",
  math: "math",
  video: "video",
  canvas: "canvas",
  a: "link",
  button: "button",
  textarea: "textbox",
  select: "combobox",
};
const INPUT_ROLE: Record<string, string> = {
  button: "button",
  submit: "button",
  reset: "button",
  image: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  search: "searchbox",
  number: "spinbutton",
};
const SECRET_NAME =
  /pass(word|code|phrase)?|pwd|secret|token|otp|cvv|cvc|ssn|pin\b|card.?num/i;
const SECRET_COMPLETE =
  /(current|new)-password|one-time-code|cc-(number|csc|exp)/i;

const squash = (value: string | null | undefined, limit: number) =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

/** A field that holds a password, one-time code, card number or similar secret. */
export function isSecureField(element: Element): boolean {
  if (!/^(input|textarea|select)$/i.test(element.localName)) return false;
  const type = (element.getAttribute("type") ?? "").toLowerCase();
  if (type === "password") return true;
  if (
    /^(input)$/i.test(element.localName) &&
    !/^(|text|search|tel|number|email)$/.test(type)
  )
    return false;
  if (SECRET_COMPLETE.test(element.getAttribute("autocomplete") ?? ""))
    return true;
  return SECRET_NAME.test(
    `${element.getAttribute("name") ?? ""} ${element.id}`,
  );
}

function kindOf(element: Element): ElementKind | undefined {
  const tag = element.localName;
  if (
    element.closest(".pdf-text-layer") &&
    element.parentElement?.classList.contains("pdf-text-layer")
  )
    return "paragraph";
  if (/^h[1-6]$/.test(tag) || element.getAttribute("role") === "heading")
    return "heading";
  if (/^(p|blockquote|dd|dt|summary|li)$/.test(tag))
    return tag === "summary" ? "button" : "paragraph";
  if (
    /^(img|picture)$/.test(tag) ||
    (tag === "svg" && element.getAttribute("role") === "img")
  )
    return "image";
  if (tag === "figure") return "figure";
  if (tag === "table") return "table";
  if (tag === "pre") return "code";
  if (
    tag === "math" ||
    /^(mjx-container)$/.test(tag) ||
    /\b(katex|MathJax)\b/.test(element.getAttribute("class") ?? "")
  )
    return "formula";
  if (tag === "video") return "video";
  if (tag === "canvas") return "canvas";
  if (tag === "a") return "link";
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    return /^(button|submit|reset|image)$/.test(type) ? "button" : "input";
  }
  if (tag === "button" || element.getAttribute("role") === "button")
    return "button";
  if (tag === "textarea" || tag === "select") return "input";
  return undefined;
}

function labelOf(element: Element, doc: Document): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return squash(aria, NAME);
  const by = element.getAttribute("aria-labelledby");
  if (by)
    return squash(
      by
        .split(/\s+/)
        .map((id) => doc.getElementById(id)?.textContent ?? "")
        .join(" "),
      NAME,
    );
  const own = element.id
    ? [...doc.getElementsByTagName("label")].find(
        (label) => label.htmlFor === element.id,
      )
    : undefined;
  const wrapping = element.closest("label");
  const label = (own ?? wrapping)?.textContent;
  if (label) return squash(label, NAME);
  return squash(
    element.getAttribute("alt") ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder"),
    NAME,
  );
}

function tableMarkdown(table: Element): string {
  const rows = [...table.querySelectorAll("tr")].map((tr) =>
    [...tr.children]
      .filter((cell) => /^(td|th)$/i.test(cell.localName))
      .map((cell) => squash(cell.textContent, 200).replace(/\|/g, "\\|")),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const line = (row: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ")} |`;
  const out = [line(rows[0]!), `| ${Array(width).fill("---").join(" | ")} |`];
  for (const row of rows.slice(1)) out.push(line(row));
  return out.join("\n").slice(0, MARKDOWN);
}

function codeLanguage(pre: Element): string | undefined {
  for (const node of [pre.querySelector("code"), pre]) {
    const text = `${node?.getAttribute("class") ?? ""} ${node?.getAttribute("data-language") ?? ""}`;
    const found = /\b(?:language|lang)-([\w+#-]{1,30})\b/.exec(text);
    if (found) return found[1]!.toLowerCase();
    const data = node?.getAttribute("data-language");
    if (data && /^[\w+#-]{1,30}$/.test(data)) return data.toLowerCase();
  }
  return undefined;
}

function contentOf(
  element: Element,
  kind: ElementKind,
): ElementContent | undefined {
  if (kind === "table") {
    const markdown = tableMarkdown(element);
    return markdown ? { markdown } : undefined;
  }
  if (kind === "code") {
    const code = (element.textContent ?? "").slice(0, CODE);
    if (!code.trim()) return undefined;
    const language = codeLanguage(element);
    return language ? { code, language } : { code };
  }
  if (kind === "formula") {
    const content: ElementContent = {};
    const tex =
      element.querySelector('annotation[encoding="application/x-tex"]')
        ?.textContent ?? element.getAttribute("data-latex");
    if (tex && tex.length <= LATEX) content.latex = tex.trim();
    const math =
      element.localName === "math" ? element : element.querySelector("math");
    if (math) {
      const ml = new XMLSerializer().serializeToString(math);
      if (ml.length <= MATHML) content.mathml = ml;
    }
    return Object.keys(content).length ? content : undefined;
  }
  return undefined;
}

function visibleRect(element: Element, view: Window) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  if (
    rect.right < 0 ||
    rect.bottom < 0 ||
    rect.left > view.innerWidth ||
    rect.top > view.innerHeight
  )
    return undefined;
  let hidden = false;
  try {
    const style = view.getComputedStyle(element);
    hidden =
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0";
  } catch {
    /* an element the engine cannot style is judged by its box alone */
  }
  if (hidden) return undefined;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  };
}

/** The visible, meaningful elements of `doc`, in document order, at most MAX_ELEMENTS. */
export function collectElements(
  doc: Document = document,
  view: Window = window,
): CollectedElement[] {
  const found: { element: Element; item: CollectedElement }[] = [];
  for (const element of doc.querySelectorAll(SELECTOR)) {
    if (found.length >= MAX_ELEMENTS) break;
    const kind = kindOf(element);
    if (!kind) continue;
    const rect = visibleRect(element, view);
    if (!rect) continue;
    const secure = kind === "input" && isSecureField(element);
    const tag = element.localName;
    const role =
      squash(element.getAttribute("role"), 64) ||
      (tag === "input"
        ? (INPUT_ROLE[(element.getAttribute("type") ?? "").toLowerCase()] ??
          "textbox")
        : (IMPLICIT_ROLE[tag] ?? kind));
    const item: CollectedElement = {
      id: `e${found.length + 1}`,
      kind,
      rect,
      role,
      name: "",
      text: "",
      secure,
    };
    if (!secure) {
      item.name = labelOf(element, doc);
      // A field's value is the user's own input: it is never read, only its label.
      if (kind !== "input") item.text = squash(element.textContent, TEXT);
      if (kind === "image" || kind === "video" || kind === "canvas")
        item.text = "";
      const content = contentOf(element, kind);
      if (content) item.content = content;
    }
    found.push({ element, item });
  }
  const byElement = new Map(
    found.map(({ element, item }) => [element, item.id]),
  );
  for (const { element, item } of found) {
    for (let up = element.parentElement; up; up = up.parentElement) {
      const parent = byElement.get(up);
      if (parent) {
        item.parentId = parent;
        break;
      }
    }
  }
  return found.map(({ item }) => item);
}
