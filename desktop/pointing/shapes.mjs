/** Hand-drawn marks (M3). Pure geometry: a kind and a rectangle in, SVG path
 * data out, with a seeded wobble so a mark looks drawn but never changes
 * between frames, scales or reloads. */
const KIND = {
  text: "underline",
  link: "circle",
  button: "circle",
  control: "circle",
  image: "outline",
  figure: "outline",
  table: "box",
  cell: "box",
  row: "box",
};
export const KINDS = Object.freeze(["underline", "circle", "outline", "box"]);
/** Every kind a drawing may name: the pen marks and the exact pick frame. */
export const DRAWN = Object.freeze([...KINDS, "frame"]);

/** text → crayon underline; control or link → circle; image or figure →
 * rounded outline; table cell → soft box. Anything else gets the outline. */
export const markKind = (element) => KIND[element?.kind] ?? "outline";

function random(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seedOf = (text) => {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
};
const r1 = (v) => Math.round(v * 10) / 10;
const pt = (x, y) => `${r1(x)} ${r1(y)}`;
const MAX_LINES = 6;
/** The pen wobbles by up to a couple of pixels past the nominal box. */
const grow = (b, by = 2) => ({
  x: b.x - by,
  y: b.y - by,
  width: b.width + by * 2,
  height: b.height + by * 2,
});

/** Smooth curve through points: quadratic segments between midpoints keep
 * the stroke soft where a polyline would show corners. */
function smooth(points, closed) {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = points.length;
  if (closed) {
    const out = [`M${pt(...mid(points[n - 1], points[0]))}`];
    for (let i = 0; i < n; i++)
      out.push(
        `Q${pt(...points[i])} ${pt(...mid(points[i], points[(i + 1) % n]))}`,
      );
    return `${out.join("")}Z`;
  }
  const out = [`M${pt(...points[0])}`];
  for (let i = 1; i < n - 1; i++)
    out.push(`Q${pt(...points[i])} ${pt(...mid(points[i], points[i + 1]))}`);
  out.push(`L${pt(...points[n - 1])}`);
  return out.join("");
}

function underline(rect, lines, rand) {
  const rows = (lines?.length ? lines : [rect]).slice(0, MAX_LINES);
  const paths = rows.map((line) => {
    const y = line.y + line.height + 3,
      n = Math.max(2, Math.round(line.width / 60));
    const points = Array.from({ length: n + 1 }, (_, i) => [
      line.x + (line.width * i) / n,
      y + (rand() - 0.5) * 3,
    ]);
    return smooth(points, false);
  });
  const x0 = Math.min(...rows.map((l) => l.x)),
    x1 = Math.max(...rows.map((l) => l.x + l.width)),
    y0 = Math.min(...rows.map((l) => l.y)),
    y1 = Math.max(...rows.map((l) => l.y + l.height + 5));
  return {
    paths,
    fill: false,
    bounds: grow({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }),
  };
}

function circle(rect, rand) {
  const cx = rect.x + rect.width / 2,
    cy = rect.y + rect.height / 2,
    rx = (rect.width / 2) * 1.18 + 7,
    ry = (rect.height / 2) * 1.18 + 7,
    start = rand() * Math.PI * 2,
    steps = 18,
    turn = Math.PI * 2 * 1.06; // the pen overshoots and closes past where it began
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const a = start + (turn * i) / steps,
      grow = 1 + (i / steps) * 0.05 + (rand() - 0.5) * 0.04;
    return [cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * ry * grow];
  });
  return {
    paths: [smooth(points, false)],
    fill: false,
    bounds: {
      x: cx - rx * 1.05,
      y: cy - ry * 1.05,
      width: rx * 2.1,
      height: ry * 2.1,
    },
  };
}

function rounded(rect, rand, fill) {
  const pad = fill ? 2 : 5,
    x = rect.x - pad,
    y = rect.y - pad,
    w = rect.width + pad * 2,
    h = rect.height + pad * 2,
    j = () => (rand() - 0.5) * 2.4;
  const c = Math.min(14, w / 4, h / 4);
  const points = [
    [x + c, y + j()],
    [x + w / 2, y + j()],
    [x + w - c, y + j()],
    [x + w + j(), y + c],
    [x + w + j(), y + h / 2],
    [x + w + j(), y + h - c],
    [x + w - c, y + h + j()],
    [x + w / 2, y + h + j()],
    [x + c, y + h + j()],
    [x + j(), y + h - c],
    [x + j(), y + h / 2],
    [x + j(), y + c],
  ];
  return {
    paths: [smooth(points, true)],
    fill,
    bounds: grow({ x, y, width: w, height: h }),
  };
}

/** `{ paths, fill, bounds }` for one mark; `bounds` is the stroke's extent. */
export function markShape(kind, rect, { seed = 1, lines } = {}) {
  // The guide's frame is the pick frame: exact, drawn by the renderer from its
  // rings, with no pen in it.
  if (kind === "frame")
    return { paths: [], fill: false, frame: true, bounds: grow(rect, 3) };
  const rand = random(seed);
  if (kind === "underline") return underline(rect, lines, rand);
  if (kind === "circle") return circle(rect, rand);
  return rounded(rect, rand, kind === "box");
}
