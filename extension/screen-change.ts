// Auto narration must not hide/reopen PiP without a gesture, or react to its own
// replies. Mask the native bubble before both hashing and sending monitor frames.
// A different selected monitor may lose this region too; no source identity is
// exposed for desktop tracks. Manual captures use their separate clearance path.
export function maskNarrationBubble(
  frame: HTMLCanvasElement,
  floating: Window,
) {
  const screen = floating.screen as Screen & {
    left?: number;
    top?: number;
    availLeft?: number;
    availTop?: number;
  };
  if (!screen.width || !screen.height || floating.closed) return;
  const context = frame.getContext("2d");
  if (!context) return;
  const sx = frame.width / screen.width;
  const sy = frame.height / screen.height;
  context.fillStyle = "#808080";
  context.fillRect(
    (floating.screenX - (screen.left ?? screen.availLeft ?? 0) - 12) * sx,
    (floating.screenY - (screen.top ?? screen.availTop ?? 0) - 12) * sy,
    (floating.outerWidth + 24) * sx,
    (floating.outerHeight + 24) * sy,
  );
}

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
