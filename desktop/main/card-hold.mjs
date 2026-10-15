/** The card closes by itself when the pointer leaves, but never over work the
 * user is in the middle of. Esc and the close button are not governed by this. */
export const noHold = Object.freeze({
  chips: false,
  dialog: false,
  pointer: false,
});
export function validHold(value) {
  return value &&
    typeof value === "object" &&
    typeof value.chips === "boolean" &&
    typeof value.dialog === "boolean" &&
    (value.pointer === undefined || typeof value.pointer === "boolean")
    ? {
        chips: value.chips,
        dialog: value.dialog,
        pointer: value.pointer === true,
      }
    : null;
}
export function cardHeld({ focused, draft, chips, dialog, pointer }) {
  return Boolean(focused || draft || chips || dialog || pointer);
}
/** The pointer has left (`leaving`); does the card go away now? */
export function leaveCloses({ pinned, open, leaving, ...hold }) {
  return Boolean(open && leaving && !pinned && !cardHeld(hold));
}
/** After a send the card gives the keyboard back to the app the user came
 * from and, unpinned, returns to the peek. A quick ask is a click on the card,
 * so the pointer is always on it: it closes regardless. A typed send leaves
 * the card open while the pointer is on it, so a follow-up can be typed; the
 * normal leave rule then closes it. */
export function sendCloses({ pinned, pointer, source }) {
  return !pinned && (source === "quick-ask" || !pointer);
}
/** The window manager may hand the keyboard to another window just after the
 * card opens (the window that closed, a focus revert). For a short settle
 * period, ask again whenever the card does not have it; afterwards a click
 * elsewhere is the user's decision and wins. Returns a cancel function. */
export function claimFocus({
  focused,
  claim,
  wanted = () => true,
  schedule = setTimeout,
  now = Date.now,
  settle = 600,
  step = 60,
}) {
  const until = now() + settle;
  let cancelled = false;
  const tick = () => {
    if (cancelled || !wanted()) return;
    if (!focused()) claim();
    if (now() < until) schedule(tick, step);
  };
  schedule(tick, step);
  return () => {
    cancelled = true;
  };
}
