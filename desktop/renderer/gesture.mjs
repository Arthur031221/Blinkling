/** Press, move, release on Blink: more than 4 px of travel makes the press a
 * drag, and a drag is never a click (N5). Pure, so it is testable without a DOM. */
export const DRAG_DISTANCE = 4;
export function createGesture(distance = DRAG_DISTANCE) {
  let origin = null,
    dragging = false;
  return {
    get dragging() {
      return dragging;
    },
    down(point) {
      origin = point;
      dragging = false;
    },
    move(point) {
      if (!origin || dragging) return null;
      if (Math.hypot(point.x - origin.x, point.y - origin.y) <= distance)
        return null;
      dragging = true;
      return "drag-start";
    },
    up() {
      if (!origin) return null;
      const result = dragging ? "drop" : "click";
      origin = null;
      dragging = false;
      return result;
    },
    cancel() {
      origin = null;
      dragging = false;
    },
  };
}
