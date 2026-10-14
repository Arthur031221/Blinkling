/** Self-contained function injected into the captured document. Restore exact
 * inline attributes, including priorities, even when capture fails or is cancelled.
 */
export function fullPageLayout(
  mode: "begin" | "next" | "end",
  id: string,
): void {
  type Saved = { element: HTMLElement; style: string | null; fixed: boolean };
  const target = window as unknown as {
    __glimpseletFullPage?: { id: string; saved: Saved[] };
  };
  const restore = () => {
    for (const { element, style } of target.__glimpseletFullPage?.saved || []) {
      if (style === null) {
        // Synchronize Chrome's dirty CSS declaration before removing the attribute.
        element.setAttribute("style", "");
        element.removeAttribute("style");
      } else element.setAttribute("style", style);
    }
    delete target.__glimpseletFullPage;
  };
  if (mode === "end") {
    if (target.__glimpseletFullPage?.id === id) restore();
    return;
  }
  if (mode === "begin") {
    if (target.__glimpseletFullPage && target.__glimpseletFullPage.id !== id)
      throw new Error("capture_busy");
    if (target.__glimpseletFullPage) return;
    const saved: Saved[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
      const position = getComputedStyle(element).position;
      if (position !== "fixed" && position !== "sticky") continue;
      saved.push({
        element,
        style: element.getAttribute("style"),
        fixed: position === "fixed",
      });
      if (position === "sticky") {
        // Sticky content stays in its original document flow and appears once.
        element.style.setProperty("position", "relative", "important");
        for (const side of ["top", "right", "bottom", "left"])
          element.style.setProperty(side, "auto", "important");
      }
    }
    target.__glimpseletFullPage = { id, saved };
  } else if (target.__glimpseletFullPage?.id === id) {
    for (const { element, fixed } of target.__glimpseletFullPage.saved)
      if (fixed) element.style.setProperty("visibility", "hidden", "important");
  }
}
