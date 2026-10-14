import { hasSensitiveContent } from "./privacy";

export type PageElement = {
  id: string;
  role: string;
  text: string;
  rect: [number, number, number, number];
};

export const MAX_GUIDE_ELEMENTS = 160;
export const GUIDE_SELECTOR =
  "main,article,section,form,[role=main],[role=region],[role=form],h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=radio],[role=combobox],.pdf-text-layer>span";

export function resolveGuideTargets(
  doc: Document = document,
): Map<string, { element: Element; role: string }> {
  const targets = new Map<string, { element: Element; role: string }>();
  for (const element of doc.querySelectorAll(GUIDE_SELECTOR)) {
    const id = registry.ids.get(element);
    if (id && guideElementAvailable(element))
      targets.set(id, { element, role: guideRole(element) });
  }
  return targets;
}

function guideRole(element: Element): string {
  return element.matches(
    "main,article,section,form,[role=main],[role=region],[role=form]",
  )
    ? "section"
    : element.matches("p,li,dt,dd,blockquote,.pdf-text-layer>span")
      ? "paragraph"
      : element.getAttribute("role") || element.tagName.toLowerCase();
}

export function guideElementSafe(element: Element): boolean {
  return (
    element.isConnected &&
    !isExcluded(element, true) &&
    !isChoiceContent(element) &&
    !hasSensitiveAncestor(element)
  );
}

export function guideElementAvailable(element: Element): boolean {
  return (
    guideElementSafe(element) && visible(element) && !!textForElement(element)
  );
}

export type PageContext = {
  documentKey?: string;
  url: string;
  title: string;
  text: string;
  elements: PageElement[];
  hasPassword: boolean;
  guideScope?: "top-document-text";
  textScope?: "top-document-text";
  excludedEmbeds?: number;
};

const privateSelector = [
  "input[type=password]",
  "[contenteditable=true]",
  "[data-private]",
  "[data-sensitive]",
  "[autocomplete=cc-number]",
  "[autocomplete=cc-csc]",
].join(",");
const ignoredTags = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "SVG",
  "CANVAS",
  "IFRAME",
  "FRAME",
  "OBJECT",
  "EMBED",
]);
const scope = globalThis as typeof globalThis & {
  blinklingElementRegistry?: { ids: WeakMap<Element, string>; nextId: number };
  blinklingDocumentKeys?: WeakMap<Document, string>;
};
const documentKeys = (scope.blinklingDocumentKeys ??= new WeakMap());
export function pageDocumentKey(doc: Document = document): string {
  let key = documentKeys.get(doc);
  if (!key) {
    key = crypto.randomUUID();
    documentKeys.set(doc, key);
  }
  return key;
}
const registry = (scope.blinklingElementRegistry ??= {
  ids: new WeakMap<Element, string>(),
  nextId: 1,
});

export function stableElementId(element: Element): string {
  let id = registry.ids.get(element);
  if (!id) {
    id = `g${registry.nextId++}`;
    registry.ids.set(element, id);
  }
  return id;
}

export function textForElement(element: Element, limit = 240): string {
  if (
    isExcluded(element) ||
    isChoiceContent(element) ||
    hasSensitiveAncestor(element)
  )
    return "";
  if (
    isFormControl(element) ||
    element.getAttribute("role")?.toLowerCase() === "combobox"
  )
    return fieldLabel(element, limit);
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
  );
  const pieces: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (contextTextNode(node)) pieces.push(node.nodeValue || "");
    if (pieces.join(" ").length >= limit) break;
  }
  const text = (
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    pieces.join(" ")
  )
    .replace(/\s+/g, " ")
    .trim();
  if (text) return text.slice(0, limit);
  // The captured hamburger has no label, but its ARIA popup contract is real
  // evidence of a menu. Do not infer its purpose from SVG paths or CSS names.
  if (
    element.matches("button,[role=button]") &&
    /^(?:menu|true)$/i.test(element.getAttribute("aria-haspopup") || "")
  ) {
    const expanded = element.getAttribute("aria-expanded");
    return (
      "Menu" +
      (expanded === "true"
        ? " (expanded)"
        : expanded === "false"
          ? " (collapsed)"
          : "")
    ).slice(0, limit);
  }
  return "";
}

function isExcluded(element: Element, includeHidden = false): boolean {
  for (
    let current: Element | null = element;
    current;
    current = composedParent(current)
  ) {
    if (
      current.matches(
        "[data-blinkling-overlay], [data-private], [data-sensitive]",
      ) ||
      ignoredTags.has(current.tagName.toUpperCase())
    )
      return true;
    const editable = current.getAttribute("contenteditable");
    if (editable !== null && editable.toLowerCase() !== "false") return true;
  }
  if (
    element.tagName === "OPTION" ||
    element.tagName === "OPTGROUP" ||
    element.getAttribute("role")?.toLowerCase() === "option"
  )
    return true;
  if (
    element instanceof HTMLInputElement &&
    /^(password|hidden|file)$/i.test(element.type)
  )
    return true;
  return (
    (!includeHidden &&
      (element.getAttribute("aria-hidden") === "true" ||
        element.hasAttribute("hidden"))) ||
    element.getAttribute("type") === "password"
  );
}

function visible(element: Element): boolean {
  for (
    let current: Element | null = element;
    current;
    current = composedParent(current)
  ) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      !style ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      current.hasAttribute("hidden") ||
      current.getAttribute("aria-hidden") === "true"
    )
      return false;
  }
  return true;
}

export function buildPageContext(
  doc: Document = document,
  explicitTextOnly = false,
): PageContext {
  return readPageContext(doc, explicitTextOnly);
}

// Explicit requests may read only inspectable top-document text and controls.
// This result never authorizes a screenshot or an automatic page request.
export function buildExplicitPageContext(
  doc: Document = document,
): PageContext {
  return buildPageContext(doc, true);
}

export function buildGuideContext(doc: Document = document): PageContext {
  const context = buildExplicitPageContext(doc);
  delete context.textScope;
  const scope = doc.querySelector("[data-blinkling-reader-page]") || doc.body;
  const candidates =
    scope && !context.hasPassword
      ? Array.from(scope.querySelectorAll(GUIDE_SELECTOR)).filter(
          guideElementAvailable,
        )
      : [];
  // Preserve content throughout the document when menus exhaust a prefix map.
  const groups = [
    candidates.filter((element) =>
      element.matches(
        "main,article,section,form,[role=main],[role=region],[role=form],h1,h2,h3,h4,h5,h6",
      ),
    ),
    candidates.filter((element) =>
      element.matches("p,li,dt,dd,blockquote,.pdf-text-layer>span"),
    ),
    candidates.filter((element) =>
      element.matches(
        "a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=radio],[role=combobox]",
      ),
    ),
  ];
  const selected = new Set<Element>();
  const budgets = [40, 80, 40];
  let spare = budgets.reduce(
    (sum, budget, i) => sum + Math.max(0, budget - groups[i].length),
    0,
  );
  for (const [i, group] of groups.entries()) {
    const count = Math.min(group.length, budgets[i] + spare);
    spare -= Math.max(0, count - budgets[i]);
    // Navigation trees and reference lists can contain hundreds of list
    // items. Map article paragraphs before filling spare slots with lists.
    const tiers =
      i === 1
        ? [
            group.filter((element) => !element.matches("li")),
            group.filter((element) => element.matches("li")),
          ]
        : [group];
    let remaining = count;
    for (const tier of tiers) {
      const take = Math.min(remaining, tier.length);
      for (let n = 0; n < take; n++)
        selected.add(
          tier[
            take === 1 ? 0 : Math.round((n * (tier.length - 1)) / (take - 1))
          ],
        );
      remaining -= take;
    }
  }
  const elements = candidates
    .filter((element) => selected.has(element))
    .slice(0, MAX_GUIDE_ELEMENTS)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: stableElementId(element),
        role: guideRole(element),
        text: textForElement(element, 500),
        rect: [
          Math.round(rect.left + doc.defaultView!.scrollX),
          Math.round(rect.top + doc.defaultView!.scrollY),
          Math.round(rect.width),
          Math.round(rect.height),
        ] as [number, number, number, number],
      };
    });
  return { ...context, elements, guideScope: "top-document-text" };
}

function readPageContext(
  doc: Document,
  explicitTextOnly: boolean,
): PageContext {
  const hasPassword = hasSensitiveContent(doc, explicitTextOnly);
  const scope =
    doc.querySelector("[data-blinkling-reader-page]") ||
    doc.body ||
    doc.documentElement;
  const elements: PageElement[] = [];
  const selector =
    "a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=radio],[role=combobox],[role=option],h1,h2,h3,h4,h5,h6";
  for (const element of Array.from(
    scope.querySelectorAll(
      selector +
        (scope.hasAttribute("data-blinkling-reader-page")
          ? ",.pdf-text-layer>span"
          : ""),
    ),
  )) {
    if (explicitTextOnly && hasPassword) break;
    if (elements.length >= 120) break;
    if (
      isExcluded(element) ||
      isChoiceContent(element) ||
      hasSensitiveAncestor(element) ||
      !visible(element)
    )
      continue;
    const text = textForElement(element);
    if (!text && !/^input$/i.test(element.tagName)) continue;
    const rect = element.getBoundingClientRect();
    elements.push({
      id: stableElementId(element),
      role: element.matches(".pdf-text-layer>span")
        ? "paragraph"
        : element.getAttribute("role") || element.tagName.toLowerCase(),
      text,
      rect: [
        Math.round(rect.left + doc.defaultView!.scrollX),
        Math.round(rect.top + doc.defaultView!.scrollY),
        Math.round(rect.width),
        Math.round(rect.height),
      ],
    });
  }

  const chunks: string[] = [];
  let length = 0;
  const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while (
    !(explicitTextOnly && hasPassword) &&
    (node = walker.nextNode()) &&
    length < 24_000
  ) {
    if (!contextTextNode(node)) continue;
    const value = (node.nodeValue || "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const piece = value.slice(0, 24_000 - length);
    chunks.push(piece);
    length += piece.length + 1;
  }
  return {
    documentKey: pageDocumentKey(doc),
    url: doc.location.href,
    title: doc.title.slice(0, 500),
    text: chunks.join(" ").slice(0, 24_000),
    elements,
    hasPassword,
    ...(explicitTextOnly
      ? {
          textScope: "top-document-text" as const,
          excludedEmbeds: doc.querySelectorAll("iframe,frame,object,embed")
            .length,
        }
      : {}),
  };
}

export function contextTextNode(node: Node, allowEmpty = false): boolean {
  const parent = composedTextParent(node);
  return !!(
    parent &&
    (node.nodeValue?.trim() || (allowEmpty && node.nodeValue === "")) &&
    restorableTextNode(node) &&
    visible(parent)
  );
}

export function contextRangeText(range: Range): string {
  const root = range.commonAncestorContainer;
  if (!root.isConnected) return "";
  const text = range.toString().trim();
  if (!text || text.length > 5000) return "";
  const safe = (node: Node): boolean => {
    if (!range.intersectsNode(node)) return true;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end =
      node === range.endContainer ? range.endOffset : node.nodeValue!.length;
    return !node.nodeValue!.slice(start, end).trim() || contextTextNode(node);
  };
  const doc =
    root.nodeType === Node.DOCUMENT_NODE
      ? (root as Document)
      : root.ownerDocument!;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!safe(root)) return "";
  } else {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) if (!safe(node)) return "";
  }
  // Chromium's Selection text includes rendered PDF.js line/word boundaries;
  // Range text concatenates the text nodes. Never substitute another selection.
  const selection = doc.defaultView?.getSelection();
  const selected = selection?.rangeCount === 1 ? selection.getRangeAt(0) : null;
  let rendered: string;
  if (
    selected &&
    selected.startContainer === range.startContainer &&
    selected.startOffset === range.startOffset &&
    selected.endContainer === range.endContainer &&
    selected.endOffset === range.endOffset
  )
    rendered = selection!.toString().trim();
  else {
    // A standalone range has no rendered Selection; retain explicit line breaks
    // without adding spaces between adjacent spans that can split a single word.
    const walker = doc.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    const pieces: string[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        const start = node === range.startContainer ? range.startOffset : 0;
        const end =
          node === range.endContainer
            ? range.endOffset
            : node.nodeValue!.length;
        pieces.push(node.nodeValue!.slice(start, end));
      } else if ((node as Element).localName === "br") pieces.push("\n");
    }
    rendered = root.nodeType === Node.TEXT_NODE ? text : pieces.join("").trim();
  }
  return rendered.length <= 5000 ? rendered : "";
}

export function restorableTextNode(node: Node): boolean {
  const parent = composedTextParent(node);
  return !!(
    parent &&
    !hasSensitiveAncestor(parent) &&
    !isExcluded(parent, true) &&
    !isChoiceContent(parent) &&
    !isFormControl(parent) &&
    parent.getAttribute("role")?.toLowerCase() !== "combobox"
  );
}

function isFormControl(element: Element): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function isChoiceContent(element: Element): boolean {
  for (
    let current: Element | null = element;
    current;
    current = composedParent(current)
  ) {
    if (
      current.matches('option, optgroup, [role="option"]') ||
      (current !== element && current.matches("select, textarea")) ||
      (current !== element &&
        current.getAttribute("role")?.toLowerCase() === "combobox")
    )
      return true;
  }
  return false;
}

function fieldLabel(element: Element, limit: number): string {
  const explicit =
    element.getAttribute("aria-label") || element.getAttribute("title");
  if (explicit) return explicit.replace(/\s+/g, " ").trim().slice(0, limit);

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    const labels = Array.from(element.labels || [])
      .map((label) => textForLabel(label))
      .filter(Boolean);
    if (labels.length) return labels.join(" ").slice(0, limit);
  }
  return "";
}

function textForLabel(label: HTMLLabelElement): string {
  const walker = label.ownerDocument.createTreeWalker(
    label,
    NodeFilter.SHOW_TEXT,
  );
  const pieces: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (contextTextNode(node)) pieces.push(node.nodeValue || "");
  }
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

function hasSensitiveAncestor(element: Element): boolean {
  for (
    let current: Element | null = element;
    current;
    current = composedParent(current)
  ) {
    if (current.matches(privateSelector)) return true;
    const label = current.getAttribute("aria-label")?.toLowerCase() || "";
    if (label.includes("password") || label.includes("credit card"))
      return true;
  }
  return false;
}

function composedParent(element: Element): Element | null {
  return (
    element.assignedSlot ||
    element.parentElement ||
    (element.getRootNode() as ShadowRoot).host ||
    null
  );
}

function composedTextParent(node: Node): Element | null {
  return (
    (node as Text).assignedSlot ||
    node.parentElement ||
    (node.getRootNode() as ShadowRoot).host ||
    null
  );
}
