const MIN_THUMBNAIL = 20;

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
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
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

const LEAD = 0.7;
const SLIVER = 0.04;
const GENIE_MAX = 360;

/** The size a pick starts at when it is sucked in: its own, down to a cap. */
export function genieSize(bounds) {
  const k = Math.min(1, GENIE_MAX / Math.max(bounds.width, bounds.height, 1));
  return {
    width: Math.max(MIN_THUMBNAIL, Math.round(bounds.width * k)),
    height: Math.max(MIN_THUMBNAIL, Math.round(bounds.height * k)),
  };
}

/** The direction the path leaves in, in radians. */
export const startAngle = ({ start, control }) =>
  Math.atan2(control.y - start.y, control.x - start.x);

/** The size of the picture once it is turned so the path leaves along +x. */
export function turnedSize({ width, height }, angle) {
  const c = Math.abs(Math.cos(angle)),
    s = Math.abs(Math.sin(angle));
  return { width: width * c + height * s, height: width * s + height * c };
}

/** Position and direction at progress q (0 to 1) along the path. */
export const pathAt = ({ start, control, end }, q) => {
  const u = 1 - q;
  return {
    x: u * u * start.x + 2 * u * q * control.x + q * q * end.x,
    y: u * u * start.y + 2 * u * q * control.y + q * q * end.y,
    angle: Math.atan2(
      2 * u * (control.y - start.y) + 2 * q * (end.y - control.y),
      2 * u * (control.x - start.x) + 2 * q * (end.x - control.x),
    ),
  };
};

/** A macOS genie: the picture is cut into columns across the way it travels, and
 * the end nearest the mouth is pulled in first. The columns behind trail along
 * the same curve, stretched so no gap shows, and every column narrows to a sliver
 * as it reaches the mouth, so the picture pours into it.
 *
 * `turned` is the picture turned to leave along +x (see turnedSize); a column is
 * drawn from the source slice `[index * width, 0, width, turned.height]` into a
 * box `length` long and `height` high, centred on (x, y), rotated by `angle`.
 * Progress 0 is the picture at rest; 1 has every column at the mouth. */
export function genieColumns(path, turned, p, { count = 16 } = {}) {
  const width = turned.width / count;
  const columns = Array.from({ length: count }, (_, index) => {
    const along = (index + 0.5) / count;
    // The leading end starts first; the trailing end is the last to arrive.
    const q = Math.min(1, Math.max(0, p * (1 + LEAD) - LEAD * (1 - along)));
    const at = pathAt(path, q);
    const spread = (along - 0.5) * turned.width * (1 - q);
    return {
      index,
      x: at.x + Math.cos(at.angle) * spread,
      y: at.y + Math.sin(at.angle) * spread,
      angle: at.angle,
      sourceWidth: width,
      height: turned.height * (1 - (1 - SLIVER) * q ** 1.2),
      alpha: p > 0.9 ? Math.max(0, 1 - (p - 0.9) * 10) : 1,
      length: width,
    };
  });
  // Close any gap the stretch opens between neighbours.
  columns.forEach((c, i) => {
    const next = columns[Math.min(i + 1, count - 1)];
    const prev = columns[Math.max(i - 1, 0)];
    const gap = i < count - 1 ? [c, next] : [prev, c];
    c.length = Math.max(
      width,
      Math.hypot(gap[1].x - gap[0].x, gap[1].y - gap[0].y) + 1.5,
    );
  });
  return columns;
}

/** A CSS cubic-bezier token as a function of progress. */
export function cubicBezier(curve) {
  const match =
    /^cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)$/.exec(
      curve,
    );
  if (!match) throw new Error(`Not a cubic-bezier: ${curve}`);
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  const axis = (a, b, t) =>
    3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
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
