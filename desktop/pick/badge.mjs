/** The cursor shows one badge (N3.1): the green crayon while the pick key is
 * held, turning into a crosshair with a dashed rectangle once a drag starts.
 * Shift is not a mode, so it is not an input here. */
export function badgeFor({ raised, dragging }) {
  if (!raised) return "none";
  return dragging ? "crosshair" : "crayon";
}

/** Top-left of the badge beside the cursor, flipped away from screen edges. */
export function badgeOffset(cursor, bounds, size, gap = 14) {
  const right = cursor.x + gap + size.width <= bounds.x + bounds.width;
  const below = cursor.y + gap + size.height <= bounds.y + bounds.height;
  return {
    x: right ? cursor.x + gap : cursor.x - gap - size.width,
    y: below ? cursor.y + gap : cursor.y - gap - size.height,
  };
}
