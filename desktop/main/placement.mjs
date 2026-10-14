const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const CHARACTER = Object.freeze({ width: 148, height: 152, foot: 142 });
const valid = (p) =>
  p &&
  ["left", "right", "top", "bottom"].includes(p.edge) &&
  Number.isFinite(p.ratio) &&
  p.ratio >= 0 &&
  p.ratio <= 1;
/** Distance from a screen corner, in DIP, inside which a drop rests in the corner. */
const CORNER = 96;
/** Saved edge/ratio is independent of scale, resolution and desktop origin. */
export function snapPosition(display, point) {
  const a = display.workArea;
  const distances = [
    ["left", Math.abs(point.x - a.x)],
    ["right", Math.abs(point.x - a.x - a.width)],
    ["top", Math.abs(point.y - a.y)],
    ["bottom", Math.abs(point.y - a.y - a.height)],
  ];
  const edge = distances.sort((a, b) => a[1] - b[1])[0][0];
  const along = edge === "left" || edge === "right" ? a.height : a.width;
  const ratio = clamp(
    (edge === "left" || edge === "right" ? point.y - a.y : point.x - a.x) /
      along,
    0,
    1,
  );
  // A drop near a corner rests exactly in it, whichever edge was nearer.
  return {
    edge,
    ratio:
      ratio * along < CORNER ? 0 : (1 - ratio) * along < CORNER ? 1 : ratio,
  };
}
export function resolvePosition(display, saved) {
  const a = {
    ...display.workArea,
    x: display.workArea.x - display.bounds.x,
    y: display.workArea.y - display.bounds.y,
  };
  const p = valid(saved) ? saved : { edge: "right", ratio: 0.88 };
  const vertical = p.edge === "left" || p.edge === "right";
  const x = vertical
    ? p.edge === "left"
      ? a.x
      : a.x + a.width
    : clamp(a.x + a.width * p.ratio, a.x + 74, a.x + a.width - 74);
  const y = vertical
    ? clamp(a.y + a.height * p.ratio, a.y + 145, a.y + a.height - 18)
    : p.edge === "top"
      ? a.y + 70
      : a.y + a.height + 55;
  const peek = { x, y };
  // Revealing only slides Blink out from its edge. Along the edge it stays put,
  // so hovering never makes it jump sideways.
  const reveal = vertical
    ? { x: clamp(x, a.x + 90, a.x + a.width - 90), y }
    : { x, y: clamp(y, a.y + 150, a.y + a.height - 18) };
  return { ...p, peek, reveal, area: a };
}
export function reconcileDisplay(displays, id) {
  return displays.find((d) => String(d.id) === String(id)) ?? displays[0];
}
export function cardBounds(display, position) {
  const a = display.workArea,
    width = Math.min(440, a.width - 24),
    height = Math.min(520, a.height - 24);
  const anchor = {
    x: position.reveal.x + display.bounds.x,
    y: position.reveal.y + display.bounds.y,
  };
  // Beside Blink, away from its edge. On a top or bottom edge, or in a corner,
  // take whichever side has room so the card never lands on top of Blink.
  const left = anchor.x - width - 80,
    right = anchor.x + 80;
  const fits = (x) => x >= a.x + 12 && x + width <= a.x + a.width - 12;
  const sides = position.edge === "left" ? [right, left] : [left, right];
  return {
    x: Math.round(
      clamp(sides.find(fits) ?? sides[0], a.x + 12, a.x + a.width - width - 12),
    ),
    y: Math.round(
      clamp(anchor.y - height, a.y + 12, a.y + a.height - height - 12),
    ),
    width,
    height,
  };
}

const clampPlacement = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const defaultPlacement = (display) => ({
  edge: "right",
  fraction: Math.max(0, 1 - 110 / display.workArea.height),
});
export function resolvePlacement(p, display) {
  const { width: w, height: h } = display.workArea;
  const t = clampPlacement(p.fraction, 0, 1);
  return p.edge === "left"
    ? { x: 0, y: t * h }
    : p.edge === "right"
      ? { x: w, y: t * h }
      : p.edge === "top"
        ? { x: t * w, y: 0 }
        : { x: t * w, y: h };
}
export function snapPlacement(point, display) {
  const b = display.workArea;
  const x = clampPlacement(point.x - b.x, 0, b.width),
    y = clampPlacement(point.y - b.y, 0, b.height);
  const [edge] = [
    ["left", x],
    ["right", b.width - x],
    ["top", y],
    ["bottom", b.height - y],
  ].sort((a, b) => a[1] - b[1])[0];
  let fraction = ["left", "right"].includes(edge) ? y / b.height : x / b.width;
  const length = ["left", "right"].includes(edge) ? b.height : b.width;
  if (fraction * length < 64) fraction = 0;
  if ((1 - fraction) * length < 64) fraction = 1;
  return { edge, fraction };
}
export function visiblePlacement(point, display) {
  const b = display.workArea;
  return {
    x: clampPlacement(
      point.x,
      Math.min(142, b.width / 2),
      Math.max(b.width / 2, b.width - 142),
    ),
    y: clampPlacement(point.y, Math.min(294, b.height - 96), b.height - 96),
  };
}
