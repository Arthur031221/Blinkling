/** A press that ends an answered card: anywhere that is not Blinkling's own,
 * while nothing is being carried and no pick is running. */
export const outsidePress = ({ over, dragging, picking }) =>
  !over && !dragging && !picking;

/** Where a press is heard from. On X11 the main loop reads the button from the
 * pointer it already queries, so a press there is seen as an edge of that
 * state. On macOS and Windows no such state exists, so the global mouse hook
 * (uiohook on Windows, the key tap helper on macOS) says a button went down
 * and the pointer is read at that moment. Linux is left to the loop: its
 * pointer query is a round trip behind the hook, and a stale point could close
 * a card the reader was clicking. */
export const HOOKED_PLATFORMS = new Set(["darwin", "win32"]);

/** The handler for a button press the global mouse hook reports. Returns
 * whether it ended the card's reading. */
export function createHookedPress({
  platform = process.platform,
  point,
  over,
  dragging,
  picking,
  outside,
}) {
  return () => {
    if (!HOOKED_PLATFORMS.has(platform)) return false;
    const at = point();
    if (!at) return false;
    if (
      !outsidePress({
        over: over(at),
        dragging: dragging(),
        picking: picking(),
      })
    )
      return false;
    outside();
    return true;
  };
}
