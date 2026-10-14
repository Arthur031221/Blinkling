const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const CHARACTER = Object.freeze({ width: 148, height: 152, foot: 142 });
const valid = (p) =>
  p &&
  ["left", "right", "top", "bottom"].includes(p.edge) &&
  Number.isFinite(p.ratio) &&
  p.ratio >= 0 &&
  p.ratio <= 1;
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
  return {
    edge,
    ratio: clamp(
      edge === "left" || edge === "right"
        ? (point.y - a.y) / a.height
        : (point.x - a.x) / a.width,
      0,
      1,
    ),
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
  const reveal = {
    x: clamp(x, a.x + 90, a.x + a.width - 90),
    y: clamp(y, a.y + 150, a.y + a.height - 18),
  };
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
  return {
    x: Math.round(
      clamp(
        position.edge === "left" ? anchor.x + 80 : anchor.x - width - 80,
        a.x + 12,
        a.x + a.width - width - 12,
      ),
    ),
    y: Math.round(
      clamp(anchor.y - height, a.y + 12, a.y + a.height - height - 12),
    ),
    width,
    height,
  };
}
