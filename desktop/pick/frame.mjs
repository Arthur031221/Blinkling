import { duration, timing } from "../shared/motion.mjs";

/** The pick frame: an exact rounded rectangle on the edge of what was taken,
 * 2 px of Blink green between a light hairline inside and a dark one outside, so
 * it reads on a white page, a black page and a photograph alike. Pure helpers,
 * kept apart so the geometry and the light are tested without a window. */
export const LINE = 2;
export const HAIRLINE = 1;
/** How much of its full strength the frame has while it ignites. */
export const IGNITE_BASE = 0.35;
/** How bright the running light settles at once the ignition is over. */
export const CALM = 0.75;
/** The longest the running light's tail gets, in px; shorter on a small frame. */
export const TAIL = 180;

const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

/** The radius, never more than half the shorter side. */
export const radiusFor = (rect, radius) =>
  clamp(radius, 0, Math.min(rect.width, rect.height) / 2);

export const perimeterOf = ({ width, height }, radius) =>
  2 * (width + height - 4 * radius) + 2 * Math.PI * radius;

/** One lap of the running light in ms: the perimeter at a steady speed, kept
 * between the shortest and the longest lap. */
export const lapOf = (perimeter) =>
  clamp(
    (perimeter / timing.edgeSpeed) * 1000,
    timing.edgeLapMin,
    timing.edgeLapMax,
  );

export const tailOf = (perimeter) => Math.min(TAIL, perimeter / 4);

/** Moves `value` to the device pixel grid so a line `width` px wide covers whole
 * device pixels. An even count of them is centred on a pixel edge; an odd count
 * on the middle of the pixel the value falls in (rounding a half up would push a
 * hairline a pixel away from the green it hugs). */
export function snap(value, width, dpr) {
  if (Math.round(width * dpr) % 2) return (Math.floor(value * dpr) + 0.5) / dpr;
  return Math.round(value * dpr) / dpr;
}

/** A ring's rectangle on the device pixel grid, so its stroke is crisp. */
export function snapRing(ring, dpr) {
  const x = snap(ring.rect.x, ring.width, dpr);
  const y = snap(ring.rect.y, ring.width, dpr);
  return {
    x,
    y,
    width: snap(ring.rect.x + ring.rect.width, ring.width, dpr) - x,
    height: snap(ring.rect.y + ring.rect.height, ring.width, dpr) - y,
  };
}

/** The three lines of the frame, outside in: a dark hairline just outside the
 * green, the green on the edge itself, a light hairline just inside. */
export function rings(rect, radius) {
  const r = radiusFor(rect, radius);
  const grown = (by) => ({
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  });
  const inner = (LINE + HAIRLINE) / 2;
  const clampInner = Math.min(inner, Math.min(rect.width, rect.height) / 2);
  return [
    {
      role: "outer",
      rect: grown(inner),
      radius: r + inner,
      width: HAIRLINE,
    },
    { role: "line", rect: grown(0), radius: r, width: LINE },
    {
      role: "inner",
      rect: grown(-clampInner),
      radius: Math.max(0, r - clampInner),
      width: HAIRLINE,
    },
  ];
}

/** Traces the rounded rectangle on `path` (a canvas context or anything with
 * moveTo, lineTo and arc): from just after the top left corner, clockwise on
 * screen, so a dash offset is a distance along the way the light runs. */
export function trace(path, { x, y, width, height }, radius) {
  const r = radiusFor({ width, height }, radius);
  const right = x + width,
    bottom = y + height;
  const half = Math.PI / 2;
  path.moveTo(x + r, y);
  path.lineTo(right - r, y);
  path.arc(right - r, y + r, r, -half, 0);
  path.lineTo(right, bottom - r);
  path.arc(right - r, bottom - r, r, 0, half);
  path.lineTo(x + r, bottom);
  path.arc(x + r, bottom - r, r, half, Math.PI);
  path.lineTo(x, y + r);
  path.arc(x + r, y + r, r, Math.PI, Math.PI + half);
  path.closePath?.();
}

/** The light `elapsed` ms after the frame was taken.
 *   base      how strong the frame itself is, 0 to 1
 *   head      where the streak's head is, as a share of the perimeter, or null
 *   strength  how bright the streak is
 *   glow      how much of the still glow shows (reduced motion only)
 * The frame ignites at 35% with one streak clockwise in `edgeIgnite` ms, then
 * settles to full strength while a calm streak runs at a constant speed. */
export function light(elapsed, perimeter, { reduced = false } = {}) {
  const lap = lapOf(perimeter);
  if (reduced)
    return {
      phase: "still",
      base: clamp(elapsed / duration.fast, 0, 1),
      head: null,
      strength: 0,
      glow: clamp(elapsed / duration.fast, 0, 1),
    };
  if (elapsed < timing.edgeIgnite)
    return {
      phase: "ignite",
      base: IGNITE_BASE,
      head: clamp(elapsed / timing.edgeIgnite, 0, 1),
      strength: 1,
      glow: 0,
    };
  const since = elapsed - timing.edgeIgnite;
  const settle = clamp(since / duration.slow, 0, 1);
  return {
    phase: "calm",
    base: IGNITE_BASE + (1 - IGNITE_BASE) * settle,
    head: (since / lap) % 1,
    strength: 1 - (1 - CALM) * settle,
    glow: 0,
  };
}
