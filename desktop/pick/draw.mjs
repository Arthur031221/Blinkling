/** Pure helpers for the layer's canvas, kept apart so they are tested without a
 * window: how much of a stroke is drawn at a moment, and the part of a polyline
 * up to that progress. */

/** Progress 0 to 1 of one stroke `elapsed` ms after its effect started. */
export function strokeProgress(stroke, elapsed, ease = (x) => x) {
  if (stroke.duration <= 0) return elapsed >= stroke.at ? 1 : 0;
  const raw = (elapsed - stroke.at) / stroke.duration;
  return ease(Math.min(1, Math.max(0, raw)));
}

export const polylineLength = (points) =>
  points.reduce(
    (sum, p, i) =>
      i ? sum + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0,
    0,
  );

/** The leading part of a polyline: its points up to `progress` of its length,
 * ending on an interpolated point so the stroke grows smoothly. */
export function partial(points, progress) {
  if (progress <= 0 || points.length < 2)
    return progress > 0 ? points.slice(0, 1) : [];
  if (progress >= 1) return points;
  const goal = polylineLength(points) * progress;
  const out = [points[0]];
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + length >= goal) {
      const f = length ? (goal - walked) / length : 0;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      return out;
    }
    out.push(b);
    walked += length;
  }
  return out;
}

/** Whether every stroke of an effect has finished `elapsed` ms in. */
export const effectDone = (plan, elapsed) => elapsed >= plan.total;

/** The point `fraction` (0 to 1) of the way along a polyline. */
export function pointAlong(points, fraction) {
  if (points.length < 2 || fraction <= 0) return points[0];
  const part = partial(points, Math.min(1, Math.max(0, fraction)));
  return part[part.length - 1];
}

/** The bright spot that runs round a rectangle capture's border: where its head
 * is and the points of its fading tail, `elapsed` ms after the border finished.
 * The border is drawn clockwise, so the spot runs clockwise. Returns null before
 * the border is done. */
export function spotTrail(points, elapsed, { period, tail = 0.12, steps = 6 }) {
  if (elapsed < 0 || points.length < 2) return null;
  const head = (elapsed / period) % 1;
  const trail = Array.from({ length: steps + 1 }, (_, i) => {
    const f = head - (tail * i) / steps;
    return {
      ...pointAlong(points, ((f % 1) + 1) % 1),
      fade: 1 - i / (steps + 1),
    };
  });
  return { head: trail[0], trail };
}
