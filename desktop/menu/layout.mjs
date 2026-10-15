/** Four round bubbles; the label of the one under the pointer unfolds beside
 * it, so every bubble keeps one fixed size and nothing reflows (N6.3). */
export const PILL = Object.freeze({ size: 42, label: 280, gap: 51, count: 4 });
const MARGIN = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** `anchor` is Blink's foot point: its body spans 124 above to 6 below it.
 * The fan opens above Blink, or below it when there is no room above (Blink
 * resting at the top edge); on a display too short for either it stands beside
 * Blink instead, so it never covers it. Each bubble's footprint includes the room its
 * label needs, so a label can never leave the screen or meet a neighbour. */
export function menuLayout(area, anchor) {
  const { size, label, gap, count } = PILL;
  const span = (count - 1) * gap + size;
  // Spring motion can settle either side of the midpoint by a tiny fraction.
  // Use pixel precision so an idle fan cannot flip sides on successive frames.
  const direction =
    Math.round(anchor.x) > Math.round(area.x + area.width / 2) ? -1 : 1;
  const top = area.y + MARGIN,
    bottom = area.y + area.height - MARGIN;
  const above = anchor.y - 132 - span,
    below = anchor.y + 16;
  const room = { up: above - top, down: bottom - (below + span) };
  const beside = room.up < 0 && room.down < 0;
  const up = room.up >= 0 || (!beside && room.up >= room.down);
  const first = clamp(
    beside ? anchor.y - 59 - span / 2 : up ? above : below,
    top,
    bottom - span,
  );
  const baseX = anchor.x + direction * (beside ? 74 + size / 2 + 12 : 26);
  const reach = size + label;
  const rects = [];
  for (let i = 0; i < count; i++) {
    // Index 0 is nearest Blink; the fan grows away from it.
    const row = up ? count - 1 - i : i;
    const curve = Math.sin(i * 0.55) * 12;
    const x = baseX + direction * curve - size / 2;
    const left = direction > 0 ? x : x - label;
    const fitted = clamp(
      left,
      area.x + MARGIN,
      area.x + area.width - MARGIN - reach,
    );
    rects.push({
      x: direction > 0 ? fitted : fitted + label,
      y: first + row * gap,
      width: size,
      height: size,
      direction,
    });
  }
  return rects;
}

/** Keep the complete spring-scaled silhouette inside the display, including
 * transient overshoot while the opening spring settles. */
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
  x += clamp(left, area.x + 8, area.x + area.width - width - 8) - left;
  y += clamp(top, area.y + 8, area.y + area.height - height - 8) - top;
  return { x, y, scale };
}
