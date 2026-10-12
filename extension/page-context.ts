import { hasSensitiveContent } from "./privacy";

export type PageElement = {
  id: string;
  role: string;
  text: string;
  rect: [number, number, number, number];
};

export type PageContext = {
  url: string;
  title: string;
  text: string;
  elements: PageElement[];
  hasPassword: boolean;
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
]);
const scope = globalThis as typeof globalThis & {
  glimpseletElementRegistry?: { ids: WeakMap<Element, string>; nextId: number };
};
const registry = (scope.glimpseletElementRegistry ??= {
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
  return text.slice(0, limit);
}

function isExcluded(element: Element, includeHidden = false): boolean {
  for (
    let current: Element | null = element;
    current;
    current = composedParent(current)
  ) {
    if (
      current.matches(
        "[data-glimpselet-overlay], [data-private], [data-sensitive]",
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

export function buildPageContext(doc: Document = document): PageContext {
  const hasPassword = hasSensitiveContent(doc);
  const scope =
    doc.querySelector("[data-glimpselet-reader-page]") ||
    doc.body ||
    doc.documentElement;
  const elements: PageElement[] = [];
  const selector =
    "a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=radio],[role=combobox],[role=option],h1,h2,h3,h4,h5,h6";
  for (const element of Array.from(
    scope.querySelectorAll(
      selector +
        (scope.hasAttribute("data-glimpselet-reader-page")
          ? ",.pdf-text-layer>span"
          : ""),
    ),
  )) {
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
  while ((node = walker.nextNode()) && length < 24_000) {
    if (!contextTextNode(node)) continue;
    const value = (node.nodeValue || "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const piece = value.slice(0, 24_000 - length);
    chunks.push(piece);
    length += piece.length + 1;
  }
  return {
    url: doc.location.href,
    title: doc.title.slice(0, 500),
    text: chunks.join(" ").slice(0, 24_000),
    elements,
    hasPassword,
  };
}

export function contextTextNode(node: Node): boolean {
  const parent = composedTextParent(node);
  return !!(
    parent &&
    node.nodeValue?.trim() &&
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
  if (root.nodeType === Node.TEXT_NODE) return safe(root) ? text : "";
  const doc =
    root.nodeType === Node.DOCUMENT_NODE
      ? (root as Document)
      : root.ownerDocument!;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) if (!safe(node)) return "";
  return text;
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
