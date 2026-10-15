/** Width of the mini composer, in DIP. Its height follows its content. */
export const MINI_WIDTH = 360;
const GAP = 16;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Where the mini box goes: beside Blink on the roomier horizontal side, centred
 * on Blink; above or below it when Blink sits on a top or bottom edge. Always
 * inside the work area. */
export function placeMini({ blink, size, workArea }) {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  const edge = 24;
  const nearTop = blink.y - workArea.y < edge;
  const nearBottom = bottom - blink.y < edge;
  let x, y;
  if (nearTop || nearBottom) {
    x = blink.x - width / 2;
    y = nearTop ? blink.y + GAP : blink.y - GAP - height;
  } else {
    const roomLeft = blink.x - workArea.x;
    const roomRight = right - blink.x;
    x = roomLeft >= roomRight ? blink.x - GAP - width : blink.x + GAP;
    y = blink.y - height / 2;
  }
  return {
    x: Math.round(clamp(x, workArea.x, right - width)),
    y: Math.round(clamp(y, workArea.y, bottom - height)),
    width,
    height,
  };
}
