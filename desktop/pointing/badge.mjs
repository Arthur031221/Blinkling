/** The number badge sits on the top-left corner of its mark. The renderer
 * draws it here and main watches the cursor against the same rectangle, so the
 * click target and the picture can never disagree. */
export const BADGE = 24;
const clamp = (v, max) => Math.min(max, Math.max(0, v));
/** `rect` and `bounds` are display relative; the badge stays on the display. */
export function badgeRect(rect, bounds) {
  return {
    x: clamp(rect.x - BADGE / 2, bounds.width - BADGE),
    y: clamp(rect.y - BADGE / 2, bounds.height - BADGE),
    width: BADGE,
    height: BADGE,
  };
}
