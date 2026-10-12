import { describe, it, expect } from "vitest";
import { differenceHash, hashDistance, ScreenChanges } from "./screen-change";
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
