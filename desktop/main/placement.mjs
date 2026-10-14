const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const defaultPlacement = (display) => ({
  edge: "right",
  fraction: Math.max(0, 1 - 110 / display.workArea.height),
});
export function resolvePlacement(p, display) {
  const { width: w, height: h } = display.workArea;
  const t = clamp(p.fraction, 0, 1);
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
  const x = clamp(point.x - b.x, 0, b.width),
    y = clamp(point.y - b.y, 0, b.height);
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
    x: clamp(
      point.x,
      Math.min(142, b.width / 2),
      Math.max(b.width / 2, b.width - 142),
    ),
    y: clamp(point.y, Math.min(294, b.height - 96), b.height - 96),
  };
}
