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
