import { duration, timing } from "../shared/motion.mjs";

/** The longest a pick effect may take (N1.3). Built from the shared tokens. */
export const EFFECT_MAX = duration.slow + duration.fast;

/** Which effect each kind of taken thing gets (M4). */
export const EFFECT_FOR = Object.freeze({
  text: "highlighter",
  image: "loop",
  table: "outline-sweep",
  code: "brackets",
  formula: "wave",
  chart: "corners",
  video: "corners",
  control: "circle",
  section: "bracket",
  window: "outline",
  screen: "outline",
  page: "outline",
  area: "outline",
});

const LINE_HEIGHT = 20;
const LINE_GAP = 30;
// A highlighter rides low on the line, just under the baseline, and is a little more than a third of its height.
const MARKER_DROP = 0.82;
const MARKER_THICK = 0.42;
const PAD = 4;
const WOBBLE = 1.6;

/** mulberry32: the same bounds always draw the same wobbly hand. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (kind, b) =>
  [...kind].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 17) ^
  Math.round(b.x * 73856093) ^
  Math.round(b.y * 19349663) ^
  Math.round(b.width * 83492791) ^
  Math.round(b.height * 2654435761);

const round = (n) => Math.round(n * 100) / 100;
const point = (x, y) => ({ x: round(x), y: round(y) });

/** A hand-drawn line a to b: interior points wander off the line a little. */
function line(a, b, rand, amp = WOBBLE) {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const steps = Math.max(2, Math.ceil(length / 24));
  const nx = -(b.y - a.y) / length,
    ny = (b.x - a.x) / length;
  const out = [point(a.x, a.y)];
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const w = (rand() - 0.5) * 2 * amp;
    out.push(
      point(a.x + (b.x - a.x) * f + nx * w, a.y + (b.y - a.y) * f + ny * w),
    );
  }
  out.push(point(b.x, b.y));
  return out;
}

function path(corners, rand, amp) {
  const out = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const segment = line(corners[i], corners[i + 1], rand, amp);
    out.push(...(i ? segment.slice(1) : segment));
  }
  return out;
}

const rectCorners = (b, pad = PAD) => {
  const l = b.x - pad,
    t = b.y - pad,
    r = b.x + b.width + pad,
    bt = b.y + b.height + pad;
  // Overshoot the start a little, like a pen that does not lift exactly there.
  return [
    { x: l, y: t },
    { x: r, y: t },
    { x: r, y: bt },
    { x: l, y: bt },
    { x: l, y: t + 3 },
  ];
};

/** One loop around the bounds that closes on itself, a pen-width past the start. */
function loop(b, rand, pad = 8) {
  const cx = b.x + b.width / 2,
    cy = b.y + b.height / 2;
  const rx = b.width / 2 + pad,
    ry = b.height / 2 + pad;
  const circumference =
    Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const steps = Math.min(96, Math.max(24, Math.ceil(circumference / 16)));
  const start = -Math.PI / 2 - 0.4;
  const overshoot = Math.min(0.1, 6 / Math.max(rx, ry));
  const sweep = Math.PI * 2 + overshoot;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const angle = start + sweep * f;
    const radial =
      1 + (rand() - 0.5) * 0.02 + (i === steps ? 3 / Math.max(rx, ry) : 0);
    out.push(
      point(
        cx + Math.cos(angle) * rx * radial,
        cy + Math.sin(angle) * ry * radial,
      ),
    );
  }
  return out;
}

function corners(b, rand) {
  const arm = Math.max(10, Math.min(28, Math.min(b.width, b.height) / 4));
  const l = b.x - PAD,
    t = b.y - PAD,
    r = b.x + b.width + PAD,
    bt = b.y + b.height + PAD;
  const at = (x, y, dx, dy) => [
    { x: x + dx * arm, y },
    { x, y },
    { x, y: y + dy * arm },
  ];
  return [
    at(l, t, 1, 1),
    at(r, t, -1, 1),
    at(r, bt, -1, -1),
    at(l, bt, 1, -1),
  ].map((c) => ({ role: "corner", points: path(c, rand, 0.6) }));
}

function highlighter(b, lines, rand) {
  const rows = lines.length
    ? lines
    : Array.from(
        { length: Math.max(1, Math.round(b.height / LINE_HEIGHT)) },
        (_, i) => ({
          x: b.x,
          y: b.y + i * LINE_HEIGHT,
          width: b.width,
          height: LINE_HEIGHT,
        }),
      );
  const n = rows.length;
  // Gaps shrink for long texts so the cap holds and no line is skipped.
  const gap =
    n > 1 ? Math.min(LINE_GAP, (EFFECT_MAX - duration.fast) / (n - 1)) : 0;
  const stroke = Math.min(duration.fast, EFFECT_MAX - gap * (n - 1));
  return rows.map((row, i) => {
    const y = row.y + row.height * MARKER_DROP;
    const a = { x: row.x - 2, y: y + (rand() - 0.5) * 0.8 };
    const z = { x: row.x + row.width + 2, y: y + (rand() - 0.5) * 0.8 };
    return {
      role: "highlight",
      points: line(a, z, rand, 0.4),
      at: Math.round(i * gap),
      duration: Math.round(stroke),
      thickness: Math.max(4, Math.round(row.height * MARKER_THICK)),
    };
  });
}

function bracket(side, b, rand) {
  const top = b.y - PAD,
    bottom = b.y + b.height + PAD;
  const edge = side === "left" ? b.x - PAD : b.x + b.width + PAD;
  const serif = side === "left" ? b.x + 2 : b.x + b.width - 2;
  const points = path(
    [
      { x: serif, y: top },
      { x: edge, y: top },
      { x: edge, y: bottom },
      { x: serif, y: bottom },
    ],
    rand,
    0.6,
  );
  // The serifs reach inward only as far as the element's own edge.
  return points.map((p) =>
    side === "left"
      ? point(Math.min(p.x, b.x + 2), p.y)
      : point(Math.max(p.x, b.x + b.width - 2), p.y),
  );
}

function wave(b, rand) {
  const y = b.y + b.height + PAD + 3;
  const steps = Math.max(8, Math.ceil(b.width / 8));
  const phase = rand() * Math.PI;
  const out = [];
  for (let i = 0; i <= steps; i++)
    out.push(
      point(b.x + (b.width * i) / steps, y + Math.sin(phase + i * 1.2) * 2),
    );
  return out;
}

/** What to draw when something is taken: a list of timed strokes in DIP, drawn
 * by the layer. Pure and deterministic, so it is tested without a window.
 * Reduced motion keeps the final shapes and fades them in once (N6). */
export function effectPlan({ kind, bounds, lines = [], reduced = false }) {
  const effect = EFFECT_FOR[kind];
  if (!effect) throw new Error(`No pick effect for ${kind}`);
  const rand = random(seedOf(kind, bounds));
  let strokes;
  switch (effect) {
    case "highlighter":
      strokes = highlighter(bounds, lines, rand);
      break;
    case "loop":
      strokes = [
        {
          role: "loop",
          points: loop(bounds, rand),
          at: 0,
          duration: duration.slow,
        },
      ];
      break;
    case "circle":
      strokes = [
        {
          role: "circle",
          points: loop(bounds, rand),
          at: 0,
          duration: duration.slow,
        },
      ];
      break;
    case "outline-sweep":
      strokes = [
        {
          role: "outline",
          points: path(rectCorners(bounds), rand),
          at: 0,
          duration: duration.base,
        },
        {
          role: "sweep",
          direction: "down",
          points: line(
            { x: bounds.x + bounds.width / 2, y: bounds.y },
            { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
            rand,
            0,
          ),
          at: duration.fast,
          duration: duration.slow,
        },
      ];
      break;
    case "brackets":
      strokes = ["left", "right"].map((side) => ({
        role: "bracket",
        points: bracket(side, bounds, rand),
        at: 0,
        duration: duration.base,
      }));
      break;
    case "wave":
      strokes = [
        {
          role: "outline",
          points: path(rectCorners(bounds), rand),
          at: 0,
          duration: duration.base,
        },
        {
          role: "wave",
          points: wave(bounds, rand),
          at: duration.fast,
          duration: duration.base,
        },
      ];
      break;
    case "corners":
      strokes = corners(bounds, rand).map((s, i) => ({
        ...s,
        at: i * Math.round(duration.fast / 4),
        duration: duration.base,
      }));
      break;
    case "bracket":
      strokes = [
        {
          role: "bracket",
          points: bracket("left", bounds, rand),
          at: 0,
          duration: duration.slow,
        },
      ];
      break;
    default:
      // A rectangle that was taken keeps an exact frame on its edge: no wobble,
      // nothing seeded. The layer draws it and the light that runs round it.
      strokes = [
        {
          role: "frame",
          rect: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
          at: 0,
          duration: timing.edgeIgnite,
        },
      ];
  }
  if (reduced) {
    strokes = strokes.map((s) => ({ ...s, at: 0, duration: duration.fast }));
    return {
      effect,
      strokes,
      total: duration.fast,
      tag: kind === "video" ? "frame" : null,
      reduced: true,
    };
  }
  const total = Math.max(...strokes.map((s) => s.at + s.duration));
  return {
    effect,
    strokes,
    total,
    tag: kind === "video" ? "frame" : null,
    reduced: false,
  };
}

/** A secure element or a blocked app: a small lock, nothing taken (N1.2). */
export function lockPlan(at) {
  return {
    effect: "lock",
    at,
    taken: false,
    strokes: [],
    total: duration.base,
    reduced: false,
  };
}
