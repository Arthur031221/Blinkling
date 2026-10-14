export const actionNames = new Set([
  "screen",
  "region",
  "full-page",
  "guide",
  "auto-explain",
  "chat",
  "settings",
  "help",
]);
export function validRegions(value, bounds) {
  return (
    Array.isArray(value) &&
    value.length <= 4096 &&
    value.every(
      (r) =>
        r &&
        typeof r === "object" &&
        ["x", "y", "width", "height"].every((k) => Number.isFinite(r[k])) &&
        r.x >= 0 &&
        r.y >= 0 &&
        r.width > 0 &&
        r.height > 0 &&
        r.x + r.width <= bounds.width + 0.01 &&
        r.y + r.height <= bounds.height + 0.01,
    )
  );
}
export function validCommand(c, bounds) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  if (c.type === "pin")
    return typeof c.value === "boolean" && Object.keys(c).length === 2;
  if (c.type === "drag-start") {
    const p = c.anchor;
    return Boolean(
      bounds &&
        p &&
        !Array.isArray(p) &&
        Object.keys(c).length === 2 &&
        Object.keys(p).length === 2 &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= -160 &&
        p.x <= bounds.width + 160 &&
        p.y >= -176 &&
        p.y <= bounds.height + 176,
    );
  }
  return (
    ["state", "drag-end", "close-chat"].includes(c.type) &&
    Object.keys(c).length === 1
  );
}
