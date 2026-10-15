/** Where Blink's art is on the desktop. The shell's Blink window covers the
 * whole display, so its bounds say nothing about where the character stands;
 * its position (relative to the display) and the character box do. */
import { CHARACTER } from "../main/placement.mjs";

// The renderer puts the box's top-left at the anchor minus these.
const ANCHOR = Object.freeze({ x: CHARACTER.width / 2, y: CHARACTER.foot });

export function blinkRect({ display, position, revealed = false }) {
  const at = revealed ? position.reveal : position.peek;
  const box = {
    x: display.bounds.x + at.x - ANCHOR.x,
    y: display.bounds.y + at.y - ANCHOR.y,
    width: CHARACTER.width,
    height: CHARACTER.height,
  };
  // Parked at an edge, half the character is off screen.
  const x = Math.max(box.x, display.bounds.x);
  const y = Math.max(box.y, display.bounds.y);
  const right = Math.min(box.x + box.width, display.bounds.x + display.bounds.width);
  const bottom = Math.min(box.y + box.height, display.bounds.y + display.bounds.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
