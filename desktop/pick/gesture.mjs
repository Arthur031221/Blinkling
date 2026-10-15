/** Past this many pixels a press becomes an area drag (N1.2). */
export const DRAG_THRESHOLD = 6;

const rectOf = (a, b) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

/** Click or drag, decided by distance from the press point. */
export function createGesture({ threshold = DRAG_THRESHOLD, bounds } = {}) {
  let start = null,
    phase = "idle",
    end = null;
  const clamp = (p) =>
    bounds
      ? {
          x: Math.min(bounds.x + bounds.width, Math.max(bounds.x, p.x)),
          y: Math.min(bounds.y + bounds.height, Math.max(bounds.y, p.y)),
        }
      : p;
  const state = () => ({
    phase,
    rect: phase === "dragging" ? rectOf(start, end) : null,
  });
  return {
    state,
    down(p) {
      start = clamp(p);
      end = start;
      phase = "pressed";
    },
    move(p) {
      if (phase === "idle") return state();
      end = clamp(p);
      if (phase === "pressed" && Math.hypot(end.x - start.x, end.y - start.y) > threshold)
        phase = "dragging";
      return state();
    },
    up(p) {
      if (phase === "idle") return null;
      end = clamp(p);
      const result =
        phase === "dragging"
          ? (() => {
              const rect = rectOf(start, end);
              // Dragging back onto the press point cancels; anything else is an area.
              return rect.width > 0 || rect.height > 0 ? { type: "area", rect } : null;
            })()
          : { type: "click", point: start };
      phase = "idle";
      start = end = null;
      return result;
    },
    cancel() {
      phase = "idle";
      start = end = null;
    },
  };
}
