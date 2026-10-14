/** Fan stays above the character. On short HiDPI displays use two branches.
 * Widening a pill moves its row neighbor aside, preserving empty input gaps. */
export function menuLayout(area, anchor, expanded = -1) {
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
  const result = [];
  for (let i = 0; i < 8; i++) {
    const row = i % rows,
      col = Math.floor(i / rows);
    let x = baseX + direction * (col * 58 + Math.sin(row * 0.55) * 12),
      y = bottom - row * gap;
    if (
      expanded >= 0 &&
      i !== expanded &&
      row === expanded % rows &&
      columns === 2
    )
      x = baseX + direction * (expanded >= rows ? -58 : 320);
    const width = i === expanded ? 252 : 42;
    let left = direction < 0 ? x - width + 21 : x - 21;
    left = Math.max(
      area.x + 8,
      Math.min(area.x + area.width - width - 8, left),
    );
    result.push({ x: left, y: y - 21, width, height: 42, direction });
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
