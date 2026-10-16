const share = (value, size) =>
  size > 0 ? Math.round(Math.max(0, Math.min(1, value / size)) * 100) : 100;

/**
 * Where Blink sits relative to the card, as a CSS transform-origin. Both are
 * in the same screen coordinates, so the card grows out of Blink on any edge.
 */
export function growOrigin(card, anchor) {
  return `${share(anchor.x - card.x, card.width)}% ${share(anchor.y - card.y, card.height)}%`;
}

/** Blink's anchor in screen coordinates, from the shell's state snapshot. */
export const anchorOf = ({ display, position }) => ({
  x: position.reveal.x + display.bounds.x,
  y: position.reveal.y + display.bounds.y,
});

/** Keeps the tail clear of the card's rounded corners. */
export const TAIL_INSET = 36;
/**
 * The tail that points the card at Blink's mouth: which side of the card it
 * grows from and how far along that side, in px from the card's top left. Card
 * and mouth are in the same screen coordinates. No tail when the mouth is
 * under the card.
 */
export function tailOf(card, mouth) {
  const along = (value, size) =>
    Math.round(
      Math.max(
        Math.min(TAIL_INSET, size / 2),
        Math.min(size - TAIL_INSET, value),
      ),
    );
  if (mouth.x < card.x)
    return { side: "left", at: along(mouth.y - card.y, card.height) };
  if (mouth.x > card.x + card.width)
    return { side: "right", at: along(mouth.y - card.y, card.height) };
  if (mouth.y < card.y)
    return { side: "top", at: along(mouth.x - card.x, card.width) };
  if (mouth.y > card.y + card.height)
    return { side: "bottom", at: along(mouth.x - card.x, card.width) };
  return null;
}

/** Blink's mouth in screen coordinates, from the shell's state snapshot. */
export const mouthOfState = ({ display, mouth }) => ({
  x: mouth.x + display.bounds.x,
  y: mouth.y + display.bounds.y,
});
