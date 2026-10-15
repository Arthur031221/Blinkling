import {
  composedParent,
  isExcluded,
  isSecureField,
  visible,
} from "./page-text";

export type CollectedElement = {
  id: string;
  kind: string;
  /** The HTML tag, lowercase: a canvas and an svg both have the role img. */
  tag: string;
  /** Viewport CSS px. */
  rect: { x: number; y: number; width: number; height: number };
  role: string;
  name: string;
  text: string;
  parentId: string | null;
  secure: boolean;
  content?: {
    markdown?: string;
    code?: string;
    language?: string;
    latex?: string;
    mathml?: string;
  };
};
export type CollectedPage = {
  elements: CollectedElement[];
  /** What the user has selected on the page, never from a secure or private region. */
  selection?: {
    text: string;
    rect: { x: number; y: number; width: number; height: number };
  };
  viewport: { width: number; height: number };
  /** Same-origin frames and open shadow roots are read; the rest are counted. */
  skippedFrames: number;
};

export const MAX_COLLECTED = 400;
const MAX_SCANNED = 20_000;
const MAX_TEXT = 500;
const MAX_CONTENT = 4000;

const SELECTOR = [
  "h1,h2,h3,h4,h5,h6",
  "p,li,blockquote,figcaption",
  "a[href],button,summary",
  "input,textarea,select",
  "img,picture,svg[role=img],canvas,video,audio",
  "pre,code,table,figure,td,th",
  "math,.katex,mjx-container",
  "nav,main,article,aside,header,footer,form,dialog",
  "[role]",
].join(",");
const implicitRole: Record<string, string> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  p: "paragraph",
  li: "listitem",
  blockquote: "blockquote",
  figcaption: "caption",
  a: "link",
  button: "button",
  summary: "button",
  textarea: "textbox",
  select: "combobox",
  img: "img",
  picture: "img",
  canvas: "img",
  video: "video",
  audio: "audio",
  pre: "code",
  code: "code",
  table: "table",
  figure: "figure",
  td: "cell",
  th: "columnheader",
  math: "math",
  nav: "navigation",
  main: "main",
  article: "article",
  aside: "complementary",
  header: "banner",
  footer: "contentinfo",
  form: "form",
  dialog: "dialog",
};
const inputRole: Record<string, string> = {
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
const kindOfRole: Record<string, string> = {
  heading: "heading",
  paragraph: "paragraph",
  listitem: "listitem",
  link: "link",
  button: "button",
  textbox: "input",
  searchbox: "input",
  combobox: "input",
  spinbutton: "input",
  checkbox: "input",
  radio: "input",
  slider: "input",
  img: "image",
  video: "media",
  audio: "media",
  code: "code",
  table: "table",
  figure: "figure",
  math: "math",
  blockquote: "quote",
  caption: "caption",
};

const CONTAINERS = new Set([
  "main",
  "navigation",
  "article",
  "complementary",
  "banner",
  "contentinfo",
  "form",
  "dialog",
  "table",
  "generic",
  "region",
  "group",
  "list",
]);

const squash = (value: string | null | undefined, max: number): string =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function roleOf(element: Element): string {
  const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit) return explicit.toLowerCase();
  const tag = element.localName;
  if (tag === "input")
    return inputRole[(element as HTMLInputElement).type] ?? "textbox";
  if (element.matches(".katex,mjx-container")) return "math";
  return implicitRole[tag] ?? "generic";
}

function kindOf(element: Element, role: string): string {
  if (element.matches(".katex,mjx-container")) return "math";
  return kindOfRole[role] ?? (role === "generic" ? "region" : role);
}

function labelledBy(element: Element): string {
  const ids = element.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
  const root = element.getRootNode() as Document | ShadowRoot;
  return squash(
    ids.map((id) => root.getElementById?.(id)?.textContent ?? "").join(" "),
    120,
  );
}

function nameOf(element: Element): string {
  const aria = squash(element.getAttribute("aria-label"), 120);
  if (aria) return aria;
  const referenced = labelledBy(element);
  if (referenced) return referenced;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    const label = squash(
      Array.from(element.labels ?? [])
        .map((l) => l.textContent)
        .join(" "),
      120,
    );
    if (label) return label;
    const hint =
      element.getAttribute("placeholder") || element.getAttribute("title");
    if (hint) return squash(hint, 120);
    // A button-like input is named by its caption, never by what was typed.
    if (
      element instanceof HTMLInputElement &&
      /^(button|submit|reset)$/.test(element.type)
    )
      return squash(element.value, 120);
    return "";
  }
  if (element.localName === "img")
    return squash(element.getAttribute("alt"), 120);
  const title = element.getAttribute("title");
  // A container is named by its label only: its text belongs to the children,
  // some of which may be secure.
  if (CONTAINERS.has(roleOf(element))) return squash(title, 120);
  if (title && !element.textContent?.trim()) return squash(title, 120);
  return squash(element.textContent, 120);
}

/** Visible text of a leaf-ish element. Form values are never read. */
function textOf(element: Element): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.matches("[contenteditable]:not([contenteditable=false])") ||
    element.matches("nav,main,article,aside,header,footer,form,dialog,table")
  )
    return "";
  return squash(element.textContent, MAX_TEXT);
}

function languageOf(element: Element): string | undefined {
  for (const node of [element, element.querySelector("code")]) {
    const match = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(
      node?.getAttribute("class") ?? "",
    );
    if (match) return match[1];
    const data =
      node?.getAttribute("data-language") ?? node?.getAttribute("data-lang");
    if (data) return squash(data, 40);
  }
  return undefined;
}

function tableMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr")).slice(0, 60);
  const cells = rows.map((row) =>
    Array.from(row.querySelectorAll("th,td"))
      .slice(0, 12)
      .map((cell) => squash(cell.textContent, 80).replaceAll("|", "\\|")),
  );
  if (!cells.length) return "";
  const width = Math.max(...cells.map((row) => row.length));
  const pad = (row: string[]) =>
    `| ${[...row, ...Array(width - row.length).fill("")].join(" | ")} |`;
  return [
    pad(cells[0]),
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...cells.slice(1).map(pad),
  ].join("\n");
}

function contentOf(
  element: Element,
  role: string,
): CollectedElement["content"] | undefined {
  const cap = (value: string) => value.slice(0, MAX_CONTENT);
  if (role === "code") {
    const code = element.textContent ?? "";
    if (!code.trim()) return undefined;
    const language = languageOf(element);
    return { code: cap(code), ...(language ? { language } : {}) };
  }
  if (role === "math") {
    const math =
      element.localName === "math" ? element : element.querySelector("math");
    const tex = element.querySelector(
      'annotation[encoding="application/x-tex"]',
    )?.textContent;
    const content: NonNullable<CollectedElement["content"]> = {};
    if (tex) content.latex = cap(tex.trim());
    if (math) content.mathml = cap(math.outerHTML);
    return Object.keys(content).length ? content : undefined;
  }
  if (role === "table") {
    const markdown = tableMarkdown(element);
    return markdown ? { markdown: cap(markdown) } : undefined;
  }
  if (role === "heading") {
    const level = /^h([1-6])$/.exec(element.localName)?.[1];
    const text = squash(element.textContent, MAX_TEXT);
    return text
      ? { markdown: `${"#".repeat(Number(level ?? 2))} ${text}` }
      : undefined;
  }
  if (role === "link") {
    const href = (element as HTMLAnchorElement).href;
    const text = squash(element.textContent, 200);
    return href && text ? { markdown: `[${text}](${href})` } : undefined;
  }
  if (role === "listitem") {
    const text = squash(element.textContent, MAX_TEXT);
    return text ? { markdown: `- ${text}` } : undefined;
  }
  if (role === "blockquote") {
    const text = squash(element.textContent, MAX_TEXT);
    return text ? { markdown: `> ${text}` } : undefined;
  }
  return undefined;
}

type Options = {
  /** Viewport CSS px. Elements containing it survive the cap first. */
  near?: { x: number; y: number };
  limit?: number;
};

/**
 * The structure of what is on screen, one entry per heading, paragraph, control,
 * image, code block, table or formula. Password and card fields appear as
 * secure entries with a rectangle and nothing else.
 */
export function collectElements(
  doc: Document = document,
  options: Options = {},
): CollectedPage {
  const view = doc.defaultView ?? window;
  const viewport = { width: view.innerWidth, height: view.innerHeight };
  const limit = options.limit ?? MAX_COLLECTED;
  const found: Array<{
    element: Element;
    offset: { x: number; y: number };
    rect: DOMRect;
  }> = [];
  let skippedFrames = 0;
  let scanned = 0;

  const visit = (
    root: Document | ShadowRoot | Element,
    offset = { x: 0, y: 0 },
  ) => {
    for (const element of root.querySelectorAll("*")) {
      if (++scanned > MAX_SCANNED) return;
      const shadow = element.shadowRoot;
      if (shadow && shadow.mode === "open") visit(shadow, offset);
      if (element.localName === "iframe") {
        const frame = element as HTMLIFrameElement;
        let inner: Document | null = null;
        try {
          inner = frame.contentDocument;
        } catch {
          inner = null;
        }
        if (!inner) skippedFrames++;
        else {
          const box = frame.getBoundingClientRect();
          visit(inner, { x: offset.x + box.x, y: offset.y + box.y });
        }
        continue;
      }
      if (!element.matches(SELECTOR)) continue;
      found.push({ element, offset, rect: element.getBoundingClientRect() });
    }
  };
  visit(doc);

  const taken = new Map<Element, CollectedElement>();
  const ordered: CollectedElement[] = [];
  const near = options.near;
  const candidates = found
    .map((entry) => {
      const { rect, offset } = entry;
      const box = {
        x: Math.round((rect.x + offset.x) * 10) / 10,
        y: Math.round((rect.y + offset.y) * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
      return { ...entry, box };
    })
    .filter(({ element, box }) => {
      if (box.width <= 0 || box.height <= 0) return false;
      if (
        box.x + box.width < 0 ||
        box.y + box.height < 0 ||
        box.x > viewport.width ||
        box.y > viewport.height
      )
        return false;
      if (element.closest("[data-blinkling-overlay]")) return false;
      if (
        ["script", "style", "noscript", "template"].includes(element.localName)
      )
        return false;
      return visible(element);
    });
  const hit = (box: { x: number; y: number; width: number; height: number }) =>
    !!near &&
    near.x >= box.x &&
    near.x <= box.x + box.width &&
    near.y >= box.y &&
    near.y <= box.y + box.height;
  const kept =
    candidates.length > limit
      ? [
          ...candidates.filter((c) => hit(c.box)),
          ...candidates.filter((c) => !hit(c.box)),
        ]
          .slice(0, limit)
          .sort((a, b) => candidates.indexOf(a) - candidates.indexOf(b))
      : candidates;

  let index = 0;
  for (const { element, box } of kept) {
    const role = roleOf(element);
    const secure =
      isSecureField(element) ||
      !!element.closest("[data-private],[data-sensitive]");
    const entry: CollectedElement = {
      id: `e${++index}`,
      kind: kindOf(element, role),
      tag: element.localName,
      rect: box,
      role,
      name: secure ? "" : nameOf(element),
      text: secure || isExcluded(element, true) ? "" : textOf(element),
      parentId: null,
      secure,
    };
    if (!secure && !isExcluded(element, true)) {
      const content = contentOf(element, role);
      if (content) entry.content = content;
    }
    taken.set(element, entry);
    ordered.push(entry);
  }
  for (const [element, entry] of taken) {
    for (
      let parent = composedParent(element);
      parent;
      parent = composedParent(parent)
    ) {
      const owner = taken.get(parent);
      if (owner) {
        entry.parentId = owner.id;
        break;
      }
    }
  }
  const selection = readSelection(view);
  return {
    elements: ordered,
    viewport,
    skippedFrames,
    ...(selection ? { selection } : {}),
  };
}

function readSelection(view: Window): CollectedPage["selection"] | undefined {
  const selection = view.getSelection?.();
  if (!selection || selection.rangeCount === 0) return undefined;
  const text = selection.toString().trim();
  if (!text) return undefined;
  const range = selection.getRangeAt(0);
  const anchor = range.commonAncestorContainer;
  const host = anchor instanceof Element ? anchor : anchor.parentElement;
  if (!host || isExcluded(host) || host.closest("input, textarea"))
    return undefined;
  const box = range.getBoundingClientRect();
  if (!box || box.width <= 0 || box.height <= 0) return undefined;
  return {
    text: text.slice(0, MAX_CONTENT),
    rect: {
      x: Math.round(box.x * 10) / 10,
      y: Math.round(box.y * 10) / 10,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
    },
  };
}
