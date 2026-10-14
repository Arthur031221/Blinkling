export function sampleBounds(rect, width, height, display) {
  return {
    left: Math.max(0, Math.floor((rect.x / display.bounds.width) * width)),
    right: Math.min(
      width,
      Math.ceil(((rect.x + rect.width) / display.bounds.width) * width),
    ),
    top: Math.max(0, Math.floor((rect.y / display.bounds.height) * height)),
    bottom: Math.min(
      height,
      Math.ceil(((rect.y + rect.height) / display.bounds.height) * height),
    ),
  };
}
/** Never hide sampled region interiors: moving a small control must invalidate
 * its guide even when most of the desktop is unchanged. Alpha zero is a mask. */
export function contentMoved(
  a,
  b,
  width,
  height,
  display,
  regions = [],
  { screen = 0.045, region = 0.08 } = {},
) {
  function fraction(rect) {
    const { left, right, top, bottom } = sampleBounds(
      rect,
      width,
      height,
      display,
    );
    let changed = 0,
      total = 0;
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        const i = (y * width + x) * 4;
        if (a[i + 3] === 0 || b[i + 3] === 0) continue;
        total++;
        if (
          (Math.abs(a[i] - b[i]) +
            Math.abs(a[i + 1] - b[i + 1]) +
            Math.abs(a[i + 2] - b[i + 2])) /
            765 >
          0.1
        )
          changed++;
      }
    return total ? changed / total : 0;
  }
  return (
    fraction({
      x: 0,
      y: 0,
      width: display.bounds.width,
      height: display.bounds.height,
    }) > screen || regions.some((r) => fraction(r) > region)
  );
}
export function maskBitmap(bitmap, width, height, display, masks) {
  const output = Buffer.from(bitmap);
  for (const m of masks) {
    const { left, right, top, bottom } = sampleBounds(
      m,
      width,
      height,
      display,
    );
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        if (
          m.borderOnly &&
          x > left + 2 &&
          x < right - 3 &&
          y > top + 2 &&
          y < bottom - 3
        )
          continue;
        output.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 4);
      }
  }
  return output;
}
