/** Fan stays above the character. On short HiDPI displays use two branches.
 * Widening a pill moves its row neighbor aside, preserving empty input gaps. */
export function menuLayout(area, anchor, expanded = -1) {
  const columns = area.height < 610 ? 2 : 1,
    rows = 8 / columns,
    gap = 51;
  const direction = anchor.x > area.x + area.width / 2 ? -1 : 1;
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
