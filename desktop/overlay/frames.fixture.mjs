// Synthetic desktop frames rendered at native size, then box-filtered to the
// 160x90 sample the staleness watch compares (BGRA like desktopCapturer).
export const display = {
  id: "1",
  bounds: { x: 0, y: 0, width: 1600, height: 900 },
  scaleFactor: 1,
};
const W = 1600,
  H = 900;
function noise(x, y) {
  let n = (x * 374761393 + y * 668265263) >>> 0;
  n = ((n ^ (n >> 13)) * 1274126177) >>> 0;
  return (n ^ (n >> 16)) & 255;
}
function fill(buf, rect, bgr) {
  for (let y = rect.y; y < rect.y + rect.height; y++)
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const i = (y * W + x) * 4;
      buf[i] = bgr[0];
      buf[i + 1] = bgr[1];
      buf[i + 2] = bgr[2];
      buf[i + 3] = 255;
    }
}
function blend(buf, x, y, bgr, alpha) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  for (let c = 0; c < 3; c++)
    buf[i + c] = Math.round(buf[i + c] * (1 - alpha) + bgr[c] * alpha);
}
/** A window with textured content (text-like noise) on a plain desktop. */
export function desktop({
  window = { x: 200, y: 100, width: 900, height: 600 },
} = {}) {
  const buf = Buffer.alloc(W * H * 4);
  fill(buf, { x: 0, y: 0, width: W, height: H }, [60, 50, 40]);
  fill(buf, window, [250, 250, 250]);
  for (let y = window.y + 20; y < window.y + window.height - 20; y += 18)
    for (let x = window.x + 20; x < window.x + window.width - 20; x++)
      if (noise(x >> 3, y) > 90)
        fill(buf, { x, y, width: 1, height: 8 }, [30, 30, 30]);
  return buf;
}
/** Paint what the overlay renderer paints: 3 px green outlines with soft edges
 * and a label pill, the way the compositor blends them over the desktop. */
export function withOverlay(frame, rects) {
  const buf = Buffer.from(frame);
  for (const r of rects) {
    for (let t = -2; t <= 3; t++) {
      const alpha = t === -2 || t === 3 ? 0.35 : 0.95;
      for (let x = r.x - 2; x < r.x + r.width + 3; x++) {
        blend(buf, x, r.y + t, [151, 220, 61], alpha);
        blend(buf, x, r.y + r.height + t, [151, 220, 61], alpha);
      }
      for (let y = r.y - 2; y < r.y + r.height + 3; y++) {
        blend(buf, r.x + t, y, [151, 220, 61], alpha);
        blend(buf, r.x + r.width + t, y, [151, 220, 61], alpha);
      }
    }
    const pill = { x: r.x, y: Math.max(0, r.y - 34), width: 120, height: 26 };
    for (let y = pill.y; y < pill.y + pill.height; y++)
      for (let x = pill.x; x < pill.x + pill.width; x++)
        blend(buf, x, y, [20, 25, 22], 0.9);
  }
  return buf;
}
/** Bubble windows are opaque rectangles; a streaming answer grows downward. */
export function withBubble(frame, rect) {
  const buf = Buffer.from(frame);
  fill(buf, rect, [35, 35, 38]);
  for (let y = rect.y + 10; y < rect.y + rect.height - 10; y += 16)
    for (let x = rect.x + 10; x < rect.x + rect.width - 10; x++)
      if (noise(x >> 2, y + rect.height) > 100)
        fill(buf, { x, y, width: 1, height: 8 }, [230, 230, 230]);
  return buf;
}
export function sample(frame) {
  const out = Buffer.alloc(160 * 90 * 4),
    k = W / 160;
  for (let y = 0; y < 90; y++)
    for (let x = 0; x < 160; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let yy = 0; yy < k; yy++)
          for (let xx = 0; xx < k; xx++)
            sum += frame[((y * k + yy) * W + x * k + xx) * 4 + c];
        out[(y * 160 + x) * 4 + c] = Math.round(sum / (k * k));
      }
  return out;
}
