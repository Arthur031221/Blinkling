import { CHARACTER, anchoredTop } from "../main/placement.mjs";

/** Width of the mini composer, in DIP. Its height follows its content. */
export const MINI_WIDTH = 360;
const GAP = 8;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Where Blink's body is when it stands at `point` (its feet). */
export const blinkBody = (point) => ({
  x: point.x - CHARACTER.width / 2,
  y: point.y - CHARACTER.foot,
  width: CHARACTER.width,
  height: CHARACTER.height,
});

/** Where the mini box goes. It is anchored to Blink's mouth: beside Blink, rising
 * from just under the mouth, on whichever side has more room unless that side
 * would cover something in `avoid` (N6.5: move aside, never cover the picked
 * thing). It never covers Blink's body (the send button is in its corner) and
 * stays inside the work area. Only on a display too narrow for either side does
 * it go above or below Blink, and only when the picked thing fills every
 * place near Blink does it go beside the pick.
 *
 * blink: Blink's feet. When it is outside `workArea` it stands on another
 * display, so the box is drawn towards the nearest point and its body is no
 * obstacle here. */
export function placeMini({ blink, size, workArea, avoid = [] }) {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  const here =
    blink.x >= workArea.x &&
    blink.x <= right &&
    blink.y >= workArea.y &&
    blink.y <= bottom;
  const anchor = {
    x: clamp(blink.x, workArea.x, right),
    y: clamp(blink.y, workArea.y, bottom),
  };
  const body = blinkBody(anchor);
  const centre = body.x + body.width / 2;
  const obstacles = [...(here ? [body] : []), ...avoid];

  const y = anchoredTop(body, height, workArea);
  const left = { x: body.x - GAP - width, y };
  const rightOf = { x: body.x + body.width + GAP, y };
  const roomier = centre - workArea.x >= right - centre;
  const x = centre - width / 2;
  const candidates = [
    ...(roomier ? [left, rightOf] : [rightOf, left]),
    { x, y: body.y - GAP - height },
    { x, y: body.y + body.height + GAP },
  ];
  // Only when everything near Blink is covered does the box leave its mouth,
  // for the room around what was picked.
  for (const r of avoid) {
    const cx = r.x + r.width / 2 - width / 2;
    candidates.push(
      { x: r.x - GAP - width, y },
      { x: r.x + r.width + GAP, y },
      { x: cx, y: r.y - GAP - height },
      { x: cx, y: r.y + r.height + GAP },
    );
  }
  let best = null;
  for (const c of candidates) {
    const box = {
      x: Math.round(clamp(c.x, workArea.x, right - width)),
      y: Math.round(clamp(c.y, workArea.y, bottom - height)),
      width,
      height,
    };
    const covered = obstacles.reduce((sum, o) => sum + overlap(box, o), 0);
    // Candidates come in order of preference, so only less covering beats an earlier one.
    if (!best || covered < best.covered) best = { box, covered };
  }
  return best.box;
}
