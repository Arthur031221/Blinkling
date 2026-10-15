import { BLINK_SCALE } from "./size.mjs";
/** Which part of Blink a point touches. `point` and `feet` are in the same
 * window coordinates; the drawing is 420 units wide in a 148 px box, scaled
 * around its feet by BLINK_SCALE, and its feet stand at about y = -3. */
const UNIT = 148 / 420;
export function toUnits(point, feet) {
  return {
    x: (point.x - feet.x) / BLINK_SCALE / UNIT,
    y: (point.y - feet.y) / BLINK_SCALE / UNIT - 3,
  };
}
/** The parts, as rectangles in drawing units, nearest first: the cheeks sit on
 * the face, the hands hang at the sides of the body, the feet under it. */
export function partAt(unit) {
  const { x, y } = unit;
  const ax = Math.abs(x);
  if (y < -362 || y > 10 || ax > 150) return null;
  if (y >= -80) return ax < 100 ? "foot" : null;
  if (ax >= 108 && y >= -240 && y < -90) return "hand";
  if (ax >= 108) return null;
  if (ax >= 56 && y >= -226 && y <= -166) return "cheek";
  if (y < -150) return "head";
  return "belly";
}
export const touchPart = (point, feet) => partAt(toUnits(point, feet));
/** Which side a point is on, for the hands: the left one is -1. */
export const sideOf = (point, feet) => (point.x < feet.x ? -1 : 1);

/** Where Blink looks to follow a point: each axis from -1 to 1, measured from the
 * eyes, which sit at about y = -205 in drawing units. A point a few faces away
 * already means all the way to that side. */
const EYES_AT = -205;
const REACH = 320;
export function gazeAt(point, feet) {
  const unit = toUnits(point, feet);
  const clamp = (n) => Math.max(-1, Math.min(1, n));
  return { x: clamp(unit.x / REACH), y: clamp((unit.y - EYES_AT) / REACH) };
}
