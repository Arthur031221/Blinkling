/** Electron bitmap bytes are BGRA. Include color so equal-luminance slides differ. */
export function fingerprint(bitmap) {
  if (!bitmap || bitmap.length !== 32 * 18 * 4)
    throw new Error("Invalid screen sample");
  const result = new Float32Array(32 * 18 * 3);
  for (let i = 0, j = 0; i < bitmap.length; i += 4) {
    const masked = bitmap[i + 3] === 0;
    result[j++] = masked ? NaN : bitmap[i];
    result[j++] = masked ? NaN : bitmap[i + 1];
    result[j++] = masked ? NaN : bitmap[i + 2];
  }
  return result;
}
/** Minimum time between two automatic explanations. The one place to tune it. */
export const COOLDOWN_MS = 5000;
/** Sampling never goes faster than this; it is also the interval auto explain uses. */
export const MIN_INTERVAL_MS = 1000;
/** From the baseline sample to the capture being sent: one sample to see the
 * change and `settleSamples` more to see it hold still, all at the floor interval. */
export const DETECTION_BUDGET_MS = 4000;
const W = 32,
  H = 18;
/** Two white pages share most pixels, so a navigation moves the mean only a
 * little while still changing the structure of many cells. Cursor blink, caret
 * movement and a clock tick stay far below the limits. */
const BROAD = { mean: 0.07, fraction: 0.2 };
const STRUCTURAL = { mean: 0.005, cell: 0.06, fraction: 0.02 };
/** A scroll moves text up or down as a whole. If shifting one frame by a few
 * rows makes it match the other, nothing new was read, however much text moved.
 * Beyond MAX_SHIFT rows (about half a screen) it is a different part of the page. */
const SCROLL = { maxShift: 8, ratio: 0.56, residual: 0.015 };
function residual(a, b, shift) {
  let sum = 0,
    n = 0;
  for (let row = 0; row < H; row++) {
    const other = row + shift;
    if (other < 0 || other >= H) continue;
    for (let x = 0; x < W; x++) {
      const i = (row * W + x) * 3,
        j = (other * W + x) * 3;
      if (!Number.isFinite(a[i]) || !Number.isFinite(b[j])) continue;
      sum +=
        (Math.abs(a[i] - b[j]) +
          Math.abs(a[i + 1] - b[j + 1]) +
          Math.abs(a[i + 2] - b[j + 2])) /
        (3 * 255);
      n++;
    }
  }
  return n ? sum / n : 1;
}
/** The vertical shift (rows) that explains the difference, or 0 when none does. */
export function scrollShift(a, b) {
  const unshifted = residual(a, b, 0);
  let best = unshifted,
    at = 0;
  for (let s = -SCROLL.maxShift; s <= SCROLL.maxShift; s++) {
    if (!s) continue;
    const r = residual(a, b, s);
    if (r < best) {
      best = r;
      at = s;
    }
  }
  return at && best <= SCROLL.residual && best <= unshifted * SCROLL.ratio
    ? at
    : 0;
}
export function difference(a, b) {
  if (!a || !b || a.length !== b.length || !a.length)
    return { substantial: true, mean: 1, fraction: 1 };
  let sum = 0,
    changed = 0,
    shifted = 0,
    pixels = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue;
    pixels++;
    const d =
      (Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2])) /
      (3 * 255);
    sum += d;
    if (d > 0.12) changed++;
    if (d > STRUCTURAL.cell) shifted++;
  }
  if (!pixels) return { substantial: false, mean: 0, fraction: 0 };
  const mean = sum / pixels,
    broad = mean > BROAD.mean && changed / pixels > BROAD.fraction;
  const structural =
    mean > STRUCTURAL.mean && shifted / pixels > STRUCTURAL.fraction;
  const scroll = !broad && structural ? scrollShift(a, b) : 0;
  return {
    mean,
    fraction: changed / pixels,
    scroll,
    substantial: broad || (structural && !scroll),
  };
}
export class ChangePolicy {
  constructor({ cooldownMs = COOLDOWN_MS, settleSamples = 2 } = {}) {
    this.cooldownMs = cooldownMs;
    this.settleSamples = settleSamples;
    this.lastSent = -Infinity;
    this.baseline = null;
    this.candidate = null;
    this.stable = 0;
  }
  /** `compare(a, b)` is the difference check; the watcher hands in the answers a
   * worker thread computed, and anything it did not precompute is checked here. */
  observe(
    sample,
    { now, idleSeconds, busy = false, typing = false },
    compare = difference,
  ) {
    if (busy || typing || idleSeconds < 2) {
      this.pause();
      return false;
    }
    if (!this.baseline) {
      this.baseline = sample;
      return false;
    }
    if (!compare(this.baseline, sample).substantial) {
      this.pause();
      return false;
    }
    if (this.candidate && !compare(this.candidate, sample).substantial)
      this.stable++;
    else this.stable = 1;
    this.candidate = sample;
    return (
      now - this.lastSent >= this.cooldownMs &&
      this.stable >= this.settleSamples
    );
  }
  /** `seen` is the sample the explanation was taken from, when no change was
   * watched for first (the very first ask). */
  sent(now, seen = null) {
    this.lastSent = now;
    this.baseline = this.candidate ?? seen;
    this.candidate = null;
    this.stable = 0;
  }
  pause() {
    this.candidate = null;
    this.stable = 0;
  }
  reset() {
    this.baseline = null;
    this.candidate = null;
    this.stable = 0;
  }
}
