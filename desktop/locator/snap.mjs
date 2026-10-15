// Snapping a mark rectangle to the element under it, on the device-pixel grid
// of the display the element is on.

// Below this intersection-over-union the mark is not about any element.
export const SNAP_MIN_OVERLAP = 0.3;
// Float noise from scale factors like 1.5 must not grow a rect by a device pixel.
const EPS = 1e-6;

// Candidates when the caller does not name kinds: whole windows and pages are
// not something a mark is "on".
const DEFAULT_SKIP = new Set(["window", "page"]);
const GENERIC = new Set(["section", "text"]);

const finite = (rect) =>
  rect &&
  [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
  rect.width >= 0 &&
  rect.height >= 0;

const area = (rect) => rect.width * rect.height;

export function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

// Grows the rect outward to whole device pixels (DIP * scale is an integer on
// all four edges). `origin` is the top left of the display the grid starts at.
export function alignToDevicePixels(rect, scale = 1, origin = { x: 0, y: 0 }) {
  const s = scale > 0 ? scale : 1;
  const floor = (v) => Math.floor(v * s + EPS) / s;
  const ceil = (v) => Math.ceil(v * s - EPS) / s;
  const left = floor(rect.x - origin.x) + origin.x;
  const top = floor(rect.y - origin.y) + origin.y;
  const right = ceil(rect.x + rect.width - origin.x) + origin.x;
  const bottom = ceil(rect.y + rect.height - origin.y) + origin.y;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

const contains = (rect, p) =>
  p.x >= rect.x &&
  p.y >= rect.y &&
  p.x < rect.x + rect.width &&
  p.y < rect.y + rect.height;

// The display under a point; outside every display, the nearest one.
export function displayAt(displays, point) {
  if (!displays?.length) return null;
  const hit = displays.find((d) => contains(d.bounds, point));
  if (hit) return hit;
  let best = displays[0];
  let bestDistance = Infinity;
  for (const d of displays) {
    const dx = Math.max(
      d.bounds.x - point.x,
      0,
      point.x - (d.bounds.x + d.bounds.width),
    );
    const dy = Math.max(
      d.bounds.y - point.y,
      0,
      point.y - (d.bounds.y + d.bounds.height),
    );
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      best = d;
      bestDistance = distance;
    }
  }
  return best;
}

const centre = (rect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

function align(rect, displays) {
  const display = displayAt(displays, centre(rect));
  return display
    ? alignToDevicePixels(rect, display.scaleFactor, display.bounds)
    : { ...rect };
}

// -> { rect, element }. With no element close enough the input rect comes back
// aligned to its display and element is null.
export function snapRect(rect, { elements = [], displays = [], kinds } = {}) {
  if (!finite(rect)) return { rect: { ...rect }, element: null };
  const allowed = kinds?.length ? new Set(kinds) : null;
  let best = null;
  for (const element of elements) {
    if (!finite(element?.bounds)) continue;
    if (allowed ? !allowed.has(element.kind) : DEFAULT_SKIP.has(element.kind))
      continue;
    const score = overlap(rect, element.bounds);
    if (score < SNAP_MIN_OVERLAP) continue;
    const candidate = {
      element,
      score,
      size: area(element.bounds),
      specific: GENERIC.has(element.kind) ? 0 : 1,
    };
    if (
      !best ||
      candidate.score > best.score + 1e-9 ||
      (Math.abs(candidate.score - best.score) <= 1e-9 &&
        (candidate.specific > best.specific ||
          (candidate.specific === best.specific && candidate.size < best.size)))
    )
      best = candidate;
  }
  if (!best) return { rect: align(rect, displays), element: null };
  return { rect: align(best.element.bounds, displays), element: best.element };
}
