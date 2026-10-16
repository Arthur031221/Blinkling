export function contains(rect, point) {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}
/** The box round a list of rectangles, moved by `origin`; null when empty. */
export function boundsOf(rects, origin = { x: 0, y: 0 }) {
  if (!rects?.length) return null;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.x);
    top = Math.min(top, r.y);
    right = Math.max(right, r.x + r.width);
    bottom = Math.max(bottom, r.y + r.height);
  }
  return {
    x: left + origin.x,
    y: top + origin.y,
    width: right - left,
    height: bottom - top,
  };
}
export function pixelRectToDip(rect, capture) {
  const sx = capture.region.width / capture.pixelWidth;
  const sy = capture.region.height / capture.pixelHeight;
  return {
    x: capture.region.x + rect.x * sx,
    y: capture.region.y + rect.y * sy,
    width: rect.width * sx,
    height: rect.height * sy,
  };
}

export function roundedContains(rect, point, radius) {
  if (!contains(rect, point)) return false;
  const x = Math.max(
    rect.x + radius,
    Math.min(rect.x + rect.width - radius, point.x),
  );
  const y = Math.max(
    rect.y + radius,
    Math.min(rect.y + rect.height - radius, point.y),
  );
  return (point.x - x) ** 2 + (point.y - y) ** 2 <= radius ** 2;
}
