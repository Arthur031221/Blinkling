import { describe, expect, it } from "vitest";
import { screenDimensions } from "./screen";

describe("screen image dimensions", () => {
  it("bounds landscape and portrait images by the long edge", () => {
    expect(screenDimensions(3840, 2160)).toEqual({ width: 1536, height: 864 });
    expect(screenDimensions(2160, 3840)).toEqual({ width: 864, height: 1536 });
  });

  it("bounds square images by the total pixel limit", () => {
    expect(screenDimensions(2000, 2000)).toEqual({ width: 1341, height: 1341 });
  });

  it("keeps tiny images unchanged", () => {
    expect(screenDimensions(320, 200)).toEqual({ width: 320, height: 200 });
  });

  it("keeps aspect ratio within integer rounding for large inputs", () => {
    const result = screenDimensions(10000, 1000);
    expect(result).toEqual({ width: 1536, height: 153 });
    expect(Math.abs(result.width / result.height - 10)).toBeLessThan(0.04);
  });

  it("keeps output within both limits", () => {
    const result = screenDimensions(3000, 3000);
    expect(result.width).toBeLessThanOrEqual(1536);
    expect(result.height).toBeLessThanOrEqual(1536);
    expect(result.width * result.height).toBeLessThanOrEqual(1_800_000);
  });

  it.each([
    [0, 100],
    [100, 0],
    [-1, 100],
    [100, -1],
    [1.5, 100],
    [Number.NaN, 100],
    [100, Number.POSITIVE_INFINITY],
  ])("rejects invalid dimensions %s × %s", (width, height) => {
    expect(() => screenDimensions(width, height)).toThrow(RangeError);
  });
});
