const MAX_THUMBNAIL = 96;
const MIN_THUMBNAIL = 20;
const END_SCALE = 0.3;

/** Thumbnail size: the element's aspect ratio inside a 96 DIP box. */
export function thumbnailSize(bounds) {
  const k = Math.min(1, MAX_THUMBNAIL / Math.max(bounds.width, bounds.height));
  return {
    width: Math.max(MIN_THUMBNAIL, Math.round(bounds.width * k)),
    height: Math.max(MIN_THUMBNAIL, Math.round(bounds.height * k)),
  };
}

/** The arc from the picked element to Blink: a quadratic curve whose control
 * point sits above the chord, so the thumbnail lifts off and drops in. */
export function flightPath({ from, to }) {
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const dx = to.x - start.x,
    dy = to.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  // The perpendicular that points up on screen.
  let nx = dy / length,
    ny = -dx / length;
  if (ny > 0) (nx = -nx), (ny = -ny);
  const lift = Math.min(160, Math.max(48, length * 0.3));
  return {
    start,
    end: { x: to.x, y: to.y },
    control: {
      x: (start.x + to.x) / 2 + nx * lift,
      y: (start.y + to.y) / 2 + ny * lift,
    },
  };
}

/** Position and scale at progress p (0 to 1) along the path. */
export function flightAt({ start, control, end }, p) {
  const u = 1 - p;
  return {
    x: u * u * start.x + 2 * u * p * control.x + p * p * end.x,
    y: u * u * start.y + 2 * u * p * control.y + p * p * end.y,
    scale: 1 - (1 - END_SCALE) * p,
    opacity: p > 0.9 ? 1 - (p - 0.9) * 5 : 1,
  };
}

/** A CSS cubic-bezier token as a function of progress. */
export function cubicBezier(curve) {
  const match = /^cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)$/.exec(curve);
  if (!match) throw new Error(`Not a cubic-bezier: ${curve}`);
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  const axis = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  const slope = (a, b, t) =>
    3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = axis(x1, x2, t) - x;
      const d = slope(x1, x2, t);
      if (Math.abs(error) < 1e-7 || Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    let lo = 0,
      hi = 1;
    if (t < 0 || t > 1 || Math.abs(axis(x1, x2, t) - x) > 1e-5) {
      t = x;
      for (let i = 0; i < 32; i++) {
        if (axis(x1, x2, t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return axis(y1, y2, t);
  };
}
