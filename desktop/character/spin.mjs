/** Counts how far a carried Blink has gone round in circles. The direction it
 * travels in turns a full circle for every loop, wherever the loop is, so the
 * turns of the last few seconds are added up: a straight drag never adds up,
 * however far it goes, a sharp reversal (shaking) counts for nothing, and a
 * wobble too small to be a circle is ignored. */
const WINDOW = 4000;
const STEP = 8;
const SMALLEST = 48;
const TURN = Math.PI * 2;
export function createSpinDetector({ loops = 2, window = WINDOW } = {}) {
  let anchor = null;
  let heading = null;
  let steps = [];
  let box = [];
  const turned = () => steps.reduce((sum, s) => sum + s.turn, 0);
  const full = () => {
    const xs = box.map((p) => p.x),
      ys = box.map((p) => p.y);
    const size = box.length
      ? Math.max(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
        )
      : 0;
    return size < SMALLEST ? 0 : Math.abs(turned()) / TURN;
  };
  return {
    reset() {
      anchor = heading = null;
      steps = [];
      box = [];
    },
    /** The number of full turns in the window, direction ignored. */
    add(point, now) {
      box.push({ ...point, at: now });
      while (box.length && now - box[0].at > window) box.shift();
      while (steps.length && now - steps[0].at > window) steps.shift();
      if (!anchor) {
        anchor = point;
        return full();
      }
      const dx = point.x - anchor.x,
        dy = point.y - anchor.y;
      if (Math.hypot(dx, dy) < STEP) return full();
      const next = Math.atan2(dy, dx);
      if (heading !== null) {
        let turn = next - heading;
        if (turn > Math.PI) turn -= TURN;
        if (turn < -Math.PI) turn += TURN;
        // A reversal is not part of a circle.
        if (Math.abs(turn) < 2.4) steps.push({ at: now, turn });
      }
      heading = next;
      anchor = point;
      return full();
    },
    get dizzy() {
      return full() >= loops;
    },
  };
}
