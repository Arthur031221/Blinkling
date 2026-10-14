import { describe, it, expect, vi } from "vitest";
import {
  differenceHash,
  hashDistance,
  maskNarrationBubble,
  ScreenChanges,
} from "./screen-change";
describe("passive screen changes", () => {
  it("compares luminance rather than image bytes", () => {
    const image = new Uint8ClampedArray(9 * 8 * 4);
    for (let i = 0; i < 9 * 8; i++) {
      image[i * 4] = (i % 9) * 20;
      image[i * 4 + 3] = 255;
    }
    expect(differenceHash(image)).toBe("0".repeat(64));
    for (let i = 0; i < 9 * 8; i++) image[i * 4] = 255 - image[i * 4];
    expect(differenceHash(image)).toBe("1".repeat(64));
  });
  it("waits for a stable changed frame and caps requests", () => {
    const detector = new ScreenChanges(),
      a = "0".repeat(64),
      b = "1".repeat(64);
    expect(detector.observe(a, 0)).toBe(false);
    expect(detector.observe(a, 2000)).toBe(true);
    expect(detector.observe(b, 4000)).toBe(false);
    expect(detector.observe(b, 6000)).toBe(false);
    expect(detector.observe(b, 12000)).toBe(true);
    expect(detector.observe(b, 14000)).toBe(false);
  });
  it("ignores cursor motion and rejects invalid hashes", () => {
    const detector = new ScreenChanges(),
      a = "0".repeat(64),
      small = "1".repeat(4) + "0".repeat(60);
    detector.observe(a, 0);
    detector.observe(a, 2000);
    expect(detector.observe(small, 12000)).toBe(false);
    expect(hashDistance(a, small)).toBe(4);
    expect(() => hashDistance("", a)).toThrow();
  });
});

describe("monitor narration bubble masking", () => {
  it.each([1, 2])(
    "masks native chrome and shadow at %sx capture resolution on an offset screen",
    (scale) => {
      const frame = document.createElement("canvas");
      frame.width = 1440 * scale;
      frame.height = 1000 * scale;
      const fillRect = vi.fn();
      vi.spyOn(frame, "getContext").mockReturnValue({
        fillRect,
      } as unknown as CanvasRenderingContext2D);
      const floating = {
        closed: false,
        screenX: 1600,
        screenY: 100,
        outerWidth: 420,
        outerHeight: 650,
        screen: { width: 1440, height: 1000, left: 1440, top: 0, availTop: 30 },
      } as unknown as Window;
      maskNarrationBubble(frame, floating);
      expect(fillRect).toHaveBeenCalledWith(
        148 * scale,
        88 * scale,
        444 * scale,
        674 * scale,
      );
    },
  );
});
