export type PrivacyReadMode = boolean | "visible-capture";

// Keep this function self contained: Chrome serializes it for executeScript.
// false protects automatic/full-page reads; true permits only inspectable text.
// Visible capture may exclude an opaque embed only when it paints no pixels.
export function hasSensitiveContent(
  doc: Document | null = document,
  mode: PrivacyReadMode = false,
): boolean {
  doc ??= document;
  const manualTextOnly = mode === true;
  const contributesNoPixels = (element: Element): boolean => {
    try {
      const owner = element.ownerDocument;
      const view = owner.defaultView;
      if (!view) return false;
      // Accessibility hints (aria-hidden) do not hide rendered pixels.
      const ownStyle = view.getComputedStyle(element);
      if (
        element.localName !== "object" &&
        ["hidden", "collapse"].includes(ownStyle.visibility)
      )
        return true;
      const ancestors = new Set<Element>();
      let expandedPaint = false;
      let current: Element | null = element;
      while (current) {
        if (ancestors.has(current)) return false;
        ancestors.add(current);
        const style =
          current.ownerDocument.defaultView?.getComputedStyle(current);
        if (!style) return false;
        if (style.display === "none" || style.opacity === "0") return true;
        if (style.filter && style.filter !== "none") expandedPaint = true;
        const root = current.getRootNode();
        current =
          current.assignedSlot ||
          current.parentElement ||
          (root.nodeType === 11 ? (root as ShadowRoot).host : null) ||
          current.ownerDocument.defaultView?.frameElement ||
          null;
      }
      // An object's fallback children can overflow its box; geometry alone
      // cannot prove those pixels absent. iframe/embed contents are clipped.
      if (element.localName === "object" || expandedPaint) return false;
      const rects = Array.from(element.getClientRects());
      if (!rects.length || view.innerWidth <= 0 || view.innerHeight <= 0)
        return false;
      return rects.every(
        (rect) =>
          [
            rect.left,
            rect.top,
            rect.right,
            rect.bottom,
            rect.width,
            rect.height,
          ].every(Number.isFinite) &&
          (rect.width === 0 ||
            rect.height === 0 ||
            rect.right <= 0 ||
            rect.bottom <= 0 ||
            rect.left >= view.innerWidth ||
            rect.top >= view.innerHeight),
      );
    } catch {
      return false;
    }
  };
  const roots: (Document | ShadowRoot)[] = [doc];
  const seen = new Set<Document | ShadowRoot>();
  let remaining = 50_000;
  while (roots.length) {
    const root = roots.pop()!;
    if (seen.has(root)) continue;
    seen.add(root);
    const owner = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
    if (!owner) return true;
    const walker = owner.createTreeWalker(root, 1);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (--remaining < 0) return true;
      const element = node as Element;
      if (
        element.matches(
          'input[type="password" i],input[autocomplete~="current-password" i],input[autocomplete~="new-password" i]',
        )
      )
        return true;
      if (element.shadowRoot) roots.push(element.shadowRoot);
      if (["iframe", "frame", "object", "embed"].includes(element.localName)) {
        const excludedPixels = () =>
          mode === "visible-capture" && contributesNoPixels(element);
        try {
          const frame = element as HTMLIFrameElement & {
            getSVGDocument?: () => Document | null;
          };
          const nested = frame.contentDocument ?? frame.getSVGDocument?.();
          if (!nested) {
            if (manualTextOnly || excludedPixels()) continue;
            return true;
          }
          if (
            nested.readyState !== "complete" &&
            !manualTextOnly &&
            !excludedPixels()
          )
            return true;
          const source = frame.getAttribute("src")?.trim().toLowerCase();
          // A navigating frame can temporarily expose its previous blank document.
          if (
            nested.URL === "about:blank" &&
            (frame.hasAttribute("srcdoc") ||
              (source && source !== "about:blank"))
          ) {
            if (!manualTextOnly && !excludedPixels()) return true;
          }
          roots.push(nested);
        } catch {
          if (manualTextOnly || excludedPixels()) continue;
          return true;
        }
      }
    }
  }
  return false;
}
