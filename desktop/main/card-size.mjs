/** The card is resizable: a drag on an edge changes the width or the height, a
 * drag on a corner both. The size is the card window's, in DIP. It is kept as a
 * fraction of the work area so it still makes sense on another display, and it
 * is held to sensible limits each time it is used. */
export const CARD_WIDTH_MIN = 320;
export const CARD_HEIGHT_MIN = 280;
/** The most the card takes of the work area, either way. */
export const CARD_AREA_MAX = 0.9;
export const EDGES = Object.freeze([
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
]);

export function sizeLimits(area) {
  const maxWidth = Math.max(1, Math.floor(area.width * CARD_AREA_MAX)),
    maxHeight = Math.max(1, Math.floor(area.height * CARD_AREA_MAX));
  return {
    minWidth: Math.min(CARD_WIDTH_MIN, maxWidth),
    maxWidth,
    minHeight: Math.min(CARD_HEIGHT_MIN, maxHeight),
    maxHeight,
  };
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
/** A size held to the limits of `area`. */
export function clampSize(size, area) {
  const l = sizeLimits(area);
  return {
    width: Math.round(clamp(size.width, l.minWidth, l.maxWidth)),
    height: Math.round(clamp(size.height, l.minHeight, l.maxHeight)),
  };
}
/** The size after dragging `edge` by (dx, dy) screen DIP from `base`: the edge
 * moves out to grow the card and in to shrink it, whichever side of Blink the
 * card is on. */
export function resizedSize(base, edge, dx, dy, area) {
  if (!EDGES.includes(edge)) return clampSize(base, area);
  const east = edge.includes("e"),
    west = edge.includes("w"),
    north = edge.includes("n"),
    south = edge.includes("s");
  return clampSize(
    {
      width: base.width + (east ? dx : west ? -dx : 0),
      height: base.height + (south ? dy : north ? -dy : 0),
    },
    area,
  );
}
/** What is kept: the size as a fraction of the work area. */
export const fractionsOf = (size, area) => ({
  width: Number((size.width / area.width).toFixed(4)),
  height: Number((size.height / area.height).toFixed(4)),
});
/** The kept fractions as a size on `area`, or null when nothing valid is kept
 * (the card then sizes itself). */
export function sizeFrom(fractions, area) {
  const w = Number(fractions?.width),
    h = Number(fractions?.height);
  if (!(w > 0 && w <= 1 && h > 0 && h <= 1)) return null;
  return clampSize({ width: w * area.width, height: h * area.height }, area);
}
