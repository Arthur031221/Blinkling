// Keep this function self contained: Chrome serializes it for executeScript.
export function hasSensitiveContent(doc: Document = document): boolean {
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
        try {
          const frame = element as HTMLIFrameElement & {
            getSVGDocument?: () => Document | null;
          };
          const nested = frame.contentDocument ?? frame.getSVGDocument?.();
          if (!nested || nested.readyState !== "complete") return true;
          const source = frame.getAttribute("src")?.trim().toLowerCase();
          // A navigating frame can temporarily expose its previous blank document.
          if (
            nested.URL === "about:blank" &&
            (frame.hasAttribute("srcdoc") ||
              (source && source !== "about:blank"))
          )
            return true;
          roots.push(nested);
        } catch {
          return true;
        }
      }
    }
  }
  return false;
}
