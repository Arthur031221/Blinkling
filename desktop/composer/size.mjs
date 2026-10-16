/** The card window keeps this much clear around the card: 12 px above and
 * 16 px below, where its shadow and tail go. */
export const WINDOW_MARGIN = 28;

/** The window height the card's content asks for, in px. The card is as tall as
 * its content up to the window's most, so what is not the history (header,
 * tabs, composer) is the card less the history's visible part, and the
 * history asks for all of its content. Zero while the card is not on screen. */
export function wantedHeight({ card, historyShown, historyContent }) {
  if (!(card > 0)) return 0;
  return Math.ceil(card - historyShown + historyContent + WINDOW_MARGIN);
}
