/** Where the lines of text are inside a crop (M4: crayon strokes "line by line").
 * The locator gives an element's box, not its line boxes, and the pixels are
 * the truth about what the user sees, so find the lines in the crop itself.
 * Pure: takes an RGBA bitmap, returns pixel bands. */

const INK_DIFF = 48; // sum-free per-channel distance from the background
const MIN_INK = 0.012; // share of a row's pixels that must differ
const MAX_BANDS = 80;

function background(data, width, height) {
  // Dominant colour, in 16 levels per channel: a page background is flat.
  const counts = new Map();
  const step = Math.max(1, Math.floor((width * height) / 4000));
  let best = 0;
  let bestKey = 0;
  for (let i = 0; i < width * height; i += step) {
    const o = i * 4;
    const key =
      ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > best) {
      best = n;
      bestKey = key;
    }
  }
  return [
    ((bestKey >> 8) << 4) + 8,
    (((bestKey >> 4) & 15) << 4) + 8,
    ((bestKey & 15) << 4) + 8,
  ];
}

export function textBands({ data, width, height }) {
  const bg = background(data, width, height);
  const rows = new Array(height).fill(false);
  const left = new Array(height).fill(width);
  const right = new Array(height).fill(-1);
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (
        Math.abs(data[o] - bg[0]) > INK_DIFF ||
        Math.abs(data[o + 1] - bg[1]) > INK_DIFF ||
        Math.abs(data[o + 2] - bg[2]) > INK_DIFF
      ) {
        ink++;
        if (x < left[y]) left[y] = x;
        if (x > right[y]) right[y] = x;
      }
    }
    rows[y] = ink >= Math.max(2, width * MIN_INK);
  }
  const runs = [];
  for (let y = 0; y < height; y++) {
    if (!rows[y]) continue;
    const last = runs.at(-1);
    if (last && last.top + last.height === y) last.height++;
    else runs.push({ top: y, height: 1 });
  }
  if (!runs.length) return [];
  const sorted = runs.map((r) => r.height).sort((a, b) => a - b);
  const tolerance = Math.max(2, Math.round(sorted[sorted.length >> 1] * 0.3));
  const merged = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last && run.top - (last.top + last.height) <= tolerance)
      last.height = run.top + run.height - last.top;
    else merged.push({ ...run });
  }
  return merged
    .filter((b) => b.height >= 3)
    .slice(0, MAX_BANDS)
    .map((b) => {
      let l = width;
      let r = -1;
      for (let y = b.top; y < b.top + b.height; y++) {
        l = Math.min(l, left[y]);
        r = Math.max(r, right[y]);
      }
      return { ...b, left: l, right: r + 1 };
    });
}

/** Pixel bands -> DIP rects inside the picked bounds, at any display scale. */
export function bandRects(bands, size, bounds) {
  const sx = bounds.width / size.width;
  const sy = bounds.height / size.height;
  return bands.map((b) => ({
    x: bounds.x + b.left * sx,
    y: bounds.y + b.top * sy,
    width: Math.max(1, (b.right - b.left) * sx),
    height: b.height * sy,
  }));
}
