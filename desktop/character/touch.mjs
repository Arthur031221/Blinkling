import { BLINK_SCALE } from "./size.mjs";
import { FEET } from "./index.mjs";
/** Which part of Blink a point touches. `point` and `feet` are in the same
 * window coordinates; the drawing is scaled around its feet by BLINK_SCALE
 * pixels to the unit. Units are the rig's: x from the body's centre line, y in the
 * scene, where the feet stand at FEET.y. */
export function toUnits(point, feet) {
  return {
    x: (point.x - feet.x) / BLINK_SCALE,
    y: FEET.y + (point.y - feet.y) / BLINK_SCALE,
  };
}
/** The parts, as areas in drawing units, nearest first: the cheeks sit on the
 * face, the hands hang at the sides of the body, the feet under it. */
export function partAt(unit) {
  const { x, y } = unit;
  const ax = Math.abs(x);
  if (y < 30 || y > 194 || ax > 92) return null;
  if (y >= 174) return ax < 32 ? "foot" : null;
  if (ax >= 62 && y >= 96 && y < 156) return "hand";
  if (ax >= 62) return null;
  if (ax >= 30 && y >= 106 && y <= 132) return "cheek";
  if (y < 106) return "head";
  return "belly";
}
export const touchPart = (point, feet) => partAt(toUnits(point, feet));
/** Which side a point is on, for the hands: the left one is -1. */
export const sideOf = (point, feet) => (point.x < feet.x ? -1 : 1);

/** Where Blink looks to follow a point: each axis from -1 to 1, measured from the
 * eyes, which sit at y = 92 in the drawing. A point a few faces away already means
 * all the way to that side. */
const EYES_AT = 92;
const REACH = 150;
export function gazeAt(point, feet) {
  const unit = toUnits(point, feet);
  const clamp = (n) => Math.max(-1, Math.min(1, n));
  return { x: clamp(unit.x / REACH), y: clamp((unit.y - EYES_AT) / REACH) };
}
