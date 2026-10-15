/** Distance in screen px a press may move and still be a click (N5.2). */
export const DRAG_SLOP = 4;

/** One press on Blink is either a click or a drag, never both. A press that
 * moves more than the slop at any point is a drag for the rest of its life,
 * so letting go back at the start still drops Blink instead of clicking. */
export function createGesture({ slop = DRAG_SLOP } = {}) {
  let state = "idle",
    origin = null;
  const finish = () => {
    state = "idle";
    origin = null;
  };
  return {
    get state() {
      return state;
    },
    down(point) {
      if (state !== "idle") return false;
      state = "pressed";
      origin = { x: point.x, y: point.y };
      return true;
    },
    move(point) {
      if (state !== "pressed") return null;
      if (Math.hypot(point.x - origin.x, point.y - origin.y) <= slop)
        return null;
      state = "dragging";
      return { type: "drag-start" };
    },
    up() {
      const was = state;
      finish();
      return was === "pressed"
        ? { type: "click" }
        : was === "dragging"
          ? { type: "drop" }
          : null;
    },
    /** The system took the pointer away: a press never becomes a click. */
    cancel() {
      const was = state;
      finish();
      return was === "dragging" ? { type: "drop" } : null;
    },
  };
}
