/** The card closes by itself when the pointer leaves, but never over work the
 * user is in the middle of. Esc and the close button are not governed by this. */
export const noHold = Object.freeze({ chips: false, dialog: false });
export function validHold(value) {
  return value &&
    typeof value === "object" &&
    typeof value.chips === "boolean" &&
    typeof value.dialog === "boolean"
    ? { chips: value.chips, dialog: value.dialog }
    : null;
}
export function cardHeld({ focused, draft, chips, dialog }) {
  return Boolean(focused || draft || chips || dialog);
}
/** The pointer has left (`leaving`); does the card go away now? */
export function leaveCloses({ pinned, open, leaving, ...hold }) {
  return Boolean(open && leaving && !pinned && !cardHeld(hold));
}
