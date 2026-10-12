// A difference hash ignores small colour and brightness changes. It never leaves the browser.
export function differenceHash(pixels: Uint8ClampedArray): string {
  if (pixels.length !== 9 * 8 * 4) throw new Error("Expected a 9 by 8 frame.");
  const light = (index: number) =>
    pixels[index] * 0.299 +
    pixels[index + 1] * 0.587 +
    pixels[index + 2] * 0.114;
  let bits = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const index = (y * 9 + x) * 4;
      bits += light(index) > light(index + 4) ? "1" : "0";
    }
  return bits;
}
export function hashDistance(a: string, b: string): number {
  if (a.length !== 64 || b.length !== 64)
    throw new Error("Invalid screen hash.");
  let count = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) count++;
  return count;
}
export class ScreenChanges {
  private sent?: string;
  private candidate?: string;
  private sentAt = -Infinity;
  observe(hash: string, now: number): boolean {
    if (hash.length !== 64) throw new Error("Invalid screen hash.");
    const stable =
      this.candidate !== undefined && hashDistance(this.candidate, hash) <= 4;
    this.candidate = hash;
    if (
      !stable ||
      now - this.sentAt < 10_000 ||
      (this.sent !== undefined && hashDistance(this.sent, hash) < 12)
    )
      return false;
    this.sent = hash;
    this.sentAt = now;
    return true;
  }
}
