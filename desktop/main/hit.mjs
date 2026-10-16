import { contains } from "./geometry.mjs";

/** Where a screen point is inside Blink's window. The window's own frame is the
 * origin, not the display's: where the system keeps a window off the menu bar or
 * the Dock it is a few pixels away from the display's corner, and the drawing
 * moves with the window. */
export function localPoint(point, frame) {
  return { x: point.x - frame.x, y: point.y - frame.y };
}

/** What the pointer is over, from the regions the page reports (the drawn
 * shape plus its margin, in the window's own pixels). `rim` is where the peek
 * was when the pointer pulled Blink out; it counts as Blink while it is out. */
export function pointerHit({
  point,
  frame,
  regions,
  blinkRegions = [],
  rim = [],
  out = false,
}) {
  const local = localPoint(point, frame);
  const hit = regions.some((r) => contains(r, local));
  const onBlink =
    (blinkRegions.length ? blinkRegions : regions).some((r) =>
      contains(r, local),
    ) ||
    (out && rim.some((r) => contains(r, local)));
  return { local, hit, onBlink };
}
