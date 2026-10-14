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
export const COOLDOWN_MS = 12000;
/** Two white pages share most pixels, so a navigation moves the mean only a
 * little while still changing the structure of many cells. Cursor blink, caret
 * movement, a clock tick or a small scroll stay far below both limits. */
const BROAD = { mean: 0.1, fraction: 0.3 };
const STRUCTURAL = { mean: 0.02, cell: 0.06, fraction: 0.12 };
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
  return {
    mean: sum / pixels,
    fraction: changed / pixels,
    substantial:
      (sum / pixels > BROAD.mean && changed / pixels > BROAD.fraction) ||
      (sum / pixels > STRUCTURAL.mean &&
        shifted / pixels > STRUCTURAL.fraction),
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
  observe(sample, { now, idleSeconds, busy = false, typing = false }) {
    if (busy || typing || idleSeconds < 3) {
      this.pause();
      return false;
    }
    if (!this.baseline) {
      this.baseline = sample;
      return false;
    }
    if (!difference(this.baseline, sample).substantial) {
      this.pause();
      return false;
    }
    if (this.candidate && !difference(this.candidate, sample).substantial)
      this.stable++;
    else this.stable = 1;
    this.candidate = sample;
    return (
      now - this.lastSent >= this.cooldownMs &&
      this.stable >= this.settleSamples
    );
  }
  sent(now) {
    this.lastSent = now;
    this.baseline = this.candidate;
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
