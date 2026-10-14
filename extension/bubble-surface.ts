export type BubbleState = "idle" | "hover" | "active" | "crop";
export const BUBBLE_OPACITY: Record<BubbleState, string> = {
  idle: "0.35",
  hover: "0.75",
  active: "1",
  crop: "0.25",
};

/** One owner for pointer, keyboard and crop visibility, including PiP portals. */
export function bindBubbleSurface(surface: HTMLElement) {
  const root = surface.ownerDocument.documentElement;
  const oldSurface = root.dataset.bubbleSurface;
  root.dataset.bubbleSurface = "true";
  let state: Exclude<BubbleState, "crop"> = "idle";
  let cropping = false;
  const oldOpacity = surface.style.opacity;
  const oldPointerEvents = surface.style.pointerEvents;
  const paint = () => {
    const current = cropping ? "crop" : state;
    surface.dataset.bubbleState = current;
    surface.style.opacity = BUBBLE_OPACITY[current];
    // This releases DOM hit testing. Chrome's native PiP frame still owns its
    // desktop rectangle; Document PiP offers no native click-through API.
    surface.style.pointerEvents = cropping ? "none" : oldPointerEvents;
  };
  const hover = () => {
    state = "hover";
    paint();
  };
  const idle = () => {
    state = "idle";
    paint();
  };
  const wake = () => {
    if (cropping) return;
    state = "active";
    paint();
  };
  surface.addEventListener("pointerenter", hover);
  surface.addEventListener("pointerleave", idle);
  surface.addEventListener("click", wake, true);
  surface.addEventListener("keydown", wake, true);
  surface.ownerDocument.defaultView?.addEventListener("blur", idle);
  paint();
  return {
    setCropping(value: boolean) {
      cropping = value;
      paint();
    },
    dispose() {
      surface.removeEventListener("pointerenter", hover);
      surface.removeEventListener("pointerleave", idle);
      surface.removeEventListener("click", wake, true);
      surface.removeEventListener("keydown", wake, true);
      surface.ownerDocument.defaultView?.removeEventListener("blur", idle);
      surface.style.opacity = oldOpacity;
      surface.style.pointerEvents = oldPointerEvents;
      delete surface.dataset.bubbleState;
      if (oldSurface === undefined) delete root.dataset.bubbleSurface;
      else root.dataset.bubbleSurface = oldSurface;
    },
  };
}

export type BlinkDock = { edge: "bottom" | "right"; y: number };
export const DEFAULT_BLINK_DOCK: BlinkDock = { edge: "bottom", y: 0.5 };
export function readBlinkDock(value: unknown): BlinkDock {
  if (!value || typeof value !== "object") return DEFAULT_BLINK_DOCK;
  const dock = value as BlinkDock;
  return (dock.edge === "bottom" || dock.edge === "right") &&
    typeof dock.y === "number" &&
    Number.isFinite(dock.y)
    ? { edge: dock.edge, y: Math.max(0.15, Math.min(0.85, dock.y)) }
    : DEFAULT_BLINK_DOCK;
}
export function dockBlink(y: number, height: number): BlinkDock {
  return readBlinkDock({
    edge: y >= height - 80 ? "bottom" : "right",
    y: y / Math.max(1, height),
  });
}
