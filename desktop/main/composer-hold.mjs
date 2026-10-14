/** What the card is holding for the user. The card reports it; the shell decides. */
export const emptyHold = () => ({ draft: false, chips: 0, dialog: false });
/** Untrusted renderer input: only these three plain fields survive. */
export function parseHold(value) {
  if (!value || typeof value !== "object") return null;
  const { draft, chips, dialog } = value;
  if (
    typeof draft !== "boolean" ||
    typeof dialog !== "boolean" ||
    !Number.isInteger(chips) ||
    chips < 0 ||
    chips > 1000
  )
    return null;
  return { draft, chips, dialog };
}
/** The card is in use: it has focus, a draft, a pending chip or an open dialog. */
export const holdsCard = ({ focused, hold }) =>
  Boolean(focused || hold.draft || hold.chips > 0 || hold.dialog);
/** Leaving Blink closes an unpinned card only when nothing above holds it.
 * Esc, the close button, the pin toggle and a quick ask are explicit and never ask this. */
export const closesOnLeave = ({ chatOpen, pinned, focused, hold }) =>
  chatOpen && !pinned && !holdsCard({ focused, hold });
