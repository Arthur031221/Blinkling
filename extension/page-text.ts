/**
 * Which page text and fields are safe to read or rewrite. Shared by the
 * translation walker and the element collector, so a password, a card number or
 * an editable region is treated the same way everywhere.
 */

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

export function isExcluded(element: Element, includeHidden = false): boolean {
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

export function visible(element: Element): boolean {
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

export function contextTextNode(node: Node, allowEmpty = false): boolean {
  const parent = composedTextParent(node);
  return !!(
    parent &&
    (node.nodeValue?.trim() || (allowEmpty && node.nodeValue === "")) &&
    restorableTextNode(node) &&
    visible(parent)
  );
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

export function hasSensitiveAncestor(element: Element): boolean {
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

export function composedParent(element: Element): Element | null {
  return (
    element.assignedSlot ||
    element.parentElement ||
    (element.getRootNode() as ShadowRoot).host ||
    null
  );
}

export function composedTextParent(node: Node): Element | null {
  return (
    (node as Text).assignedSlot ||
    node.parentElement ||
    (node.getRootNode() as ShadowRoot).host ||
    null
  );
}

const secureAutocomplete =
  /(^|\s)(cc-[a-z-]+|one-time-code|current-password|new-password)(\s|$)/i;

/** A field whose value or label must never leave the page: passwords, cards, one-time codes. */
export function isSecureField(element: Element): boolean {
  if (element instanceof HTMLInputElement && element.type === "password")
    return true;
  return secureAutocomplete.test(element.getAttribute("autocomplete") ?? "");
}
