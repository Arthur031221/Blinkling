/** Moving a model's box onto the element it points at. All in screen DIP, so
 * the answer does not depend on a display's scale factor or origin. */
export const MIN_IOU = 0.3;

const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);

export function intersection(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
}

/** Intersection over union, 0 for boxes that do not overlap or have no area. */
export function iou(a, b) {
  const both = intersection(a, b);
  if (!both) return 0;
  const shared = area(both);
  return shared / (area(a) + area(b) - shared);
}

export const contains = (r, p) =>
  p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;

/** The candidate that overlaps `rect` most (IoU of at least MIN_IOU) among the
 * allowed kinds; otherwise the rect itself. Secure markers never qualify. */
export function snapRect(rect, elements, { kinds } = {}) {
  const allowed = kinds?.length ? new Set(kinds) : null;
  let best = null;
  let bestScore = MIN_IOU;
  for (const element of elements ?? []) {
    if (element.secure || (allowed && !allowed.has(element.kind))) continue;
    const score = iou(rect, element.bounds);
    // A tie goes to the smaller box: the more specific element.
    if (
      score > bestScore ||
      (best && score === bestScore && area(element.bounds) < area(best.bounds))
    ) {
      best = element;
      bestScore = score;
    }
  }
  return best
    ? { rect: { ...best.bounds }, element: best }
    : { rect, element: null };
}
