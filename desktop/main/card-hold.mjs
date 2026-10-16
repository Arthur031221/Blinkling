/** What the card reports as holding it open (chips, a dialog, the pointer). */
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
