export const PILL = Object.freeze({ narrow: 42, wide: 252, height: 42 });
const CLEAR = 12;

/** Fan stays above the character. On short HiDPI displays use two branches.
 * Pills in one row never overlap: whichever is narrower steps aside for the
 * wider one at its *current* width, so a pill still growing or shrinking
 * (`widths`, one per pill) cannot run over its neighbour. */
export function menuLayout(area, anchor, expanded = -1, widths = null) {
  const columns = area.height < 610 ? 2 : 1,
    rows = 8 / columns,
    gap = 51;
  // Spring motion can settle either side of the midpoint by a tiny fraction.
  // Use pixel precision so an idle fan cannot flip sides on successive frames.
  const direction =
    Math.round(anchor.x) > Math.round(area.x + area.width / 2) ? -1 : 1;
  const baseX = Math.max(
    area.x + 32,
    Math.min(area.x + area.width - 32, anchor.x + direction * 26),
  );
  const bottom = Math.max(
    area.y + rows * gap + 14,
    Math.min(area.y + area.height - 150, anchor.y - 142),
  );
  const lo = area.x + 8,
    hi = area.x + area.width - 8;
  const fit = (left, width) => Math.max(lo, Math.min(hi - width, left));
  const result = [];
  for (let i = 0; i < 8; i++) {
    const row = i % rows,
      col = Math.floor(i / rows);
    const x = baseX + direction * (col * 58 + Math.sin(row * 0.55) * 12),
      y = bottom - row * gap;
    const width = Math.max(
      PILL.narrow,
      Math.min(
        PILL.wide,
        widths?.[i] ?? (i === expanded ? PILL.wide : PILL.narrow),
      ),
    );
    const left = fit(direction < 0 ? x - width + 21 : x - 21, width);
    result.push({ x: left, y: y - 21, width, height: PILL.height, direction });
  }
  if (columns === 2)
    for (let row = 0; row < rows; row++) {
      const inner = result[row],
        outer = result[row + rows];
      if (
        inner.x < outer.x + outer.width + CLEAR &&
        outer.x < inner.x + inner.width + CLEAR
      ) {
        // Keep the wider pill (the one being read) and move the other beside it,
        // preferring the side it started on.
        const [keep, move] =
          inner.width >= outer.width ? [inner, outer] : [outer, inner];
        const natural = move === outer ? direction : -direction;
        const after = keep.x + keep.width + CLEAR,
          before = keep.x - CLEAR - move.width;
        const fits = (left) => left >= lo && left + move.width <= hi;
        const options = natural > 0 ? [after, before] : [before, after];
        move.x = options.find(fits) ?? fit(options[0], move.width);
      }
    }
  return result;
}

/** Keep the complete spring-scaled silhouette inside the display, including
 * transient overshoot and a pill that widens before the opening spring settles. */
export function menuTransform(area, anchor, rect, value) {
  const progress = Math.max(0, Math.min(1, value));
  const scale = Math.max(
    0.01,
    Math.min(
      value,
      (area.width - 16) / rect.width,
      (area.height - 16) / rect.height,
    ),
  );
  let x = (anchor.x - rect.x - rect.width / 2) * (1 - progress);
  let y = (anchor.y - rect.y) * (1 - progress);
  const left = rect.x + x - ((scale - 1) * rect.width) / 2;
  const top = rect.y + y - ((scale - 1) * rect.height) / 2;
  const width = rect.width * scale,
    height = rect.height * scale;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  x += clamp(left, area.x + 8, area.x + area.width - width - 8) - left;
  y += clamp(top, area.y + 8, area.y + area.height - height - 8) - top;
  return { x, y, scale };
}
