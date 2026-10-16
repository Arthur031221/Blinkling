import { DRAWN } from "../pointing/shapes.mjs";
/** A rectangle inside the display, copied. Avoid areas use it without a mark number. */
export function validateRect(r, bounds) {
  if (
    !r ||
    !["x", "y", "width", "height"].every((k) => Number.isFinite(r[k])) ||
    r.x < 0 ||
    r.y < 0 ||
    r.width <= 0 ||
    r.height <= 0 ||
    r.x + r.width > bounds.width ||
    r.y + r.height > bounds.height
  )
    throw Error("Invalid drawing");
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
export function validateDrawing(d, bounds, i) {
  const rect = validateRect(d?.rect, bounds);
  if (
    d.label !== undefined &&
    (typeof d.label !== "string" || d.label.length > 80)
  )
    throw Error("Invalid drawing label");
  const n = d.n ?? i + 1;
  if (!Number.isInteger(n) || n < 1 || n > 99)
    throw Error("Invalid drawing number");
  if (d.kind !== undefined && !DRAWN.includes(d.kind))
    throw Error("Invalid drawing kind");
  if (d.seed !== undefined && !Number.isInteger(d.seed))
    throw Error("Invalid drawing seed");
  if (
    d.lines !== undefined &&
    (!Array.isArray(d.lines) ||
      d.lines.length > 24 ||
      !d.lines.every((l) =>
        ["x", "y", "width", "height"].every((k) => Number.isFinite(l?.[k])),
      ))
  )
    throw Error("Invalid drawing lines");
  return {
    id: String(d.id ?? i),
    rect,
    label: d.label ?? "",
    number: n,
    kind: d.kind ?? "outline",
    seed: d.seed ?? 0,
    lines: (d.lines ?? []).map(({ x, y, width, height }) => ({
      x,
      y,
      width,
      height,
    })),
  };
}
