import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCanvasPng, MAX_PNG_LENGTH } from "./png";

describe("capture PNG budget", () => {
  const prefix = "data:image/png;base64,";
  let source: HTMLCanvasElement;
  let draw: ReturnType<typeof vi.fn>;
  let encode: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    source = document.createElement("canvas");
    source.width = 4096;
    source.height = 2160;
    draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
    } as unknown as CanvasRenderingContext2D);
    encode = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue(prefix + "aGVsbG8=");
  });
  afterEach(() => vi.restoreAllMocks());

  it("preserves native dimensions when the PNG fits", () => {
    expect(encodeCanvasPng(source)).toBe(prefix + "aGVsbG8=");
    expect(source.width).toBe(4096);
    expect(source.height).toBe(2160);
    expect(draw).not.toHaveBeenCalled();
    expect(encode).toHaveBeenCalledOnce();
  });

  it("accepts the exact transport boundary", () => {
    const boundary = prefix + "a".repeat(MAX_PNG_LENGTH - prefix.length);
    encode.mockReturnValue(boundary);
    expect(encodeCanvasPng(source)).toBe(boundary);
    expect(draw).not.toHaveBeenCalled();
  });

  it.each([
    [10000, 5000],
    [8000, 6000],
    [10000, 20],
  ])(
    "bounds a compressible %s by %s PNG for both transports",
    (width, height) => {
      source.width = width;
      source.height = height;
      encodeCanvasPng(source);
      expect(draw).toHaveBeenCalledOnce();
      const [, , , outputWidth, outputHeight] = draw.mock.calls[0];
      expect(outputWidth).toBeLessThanOrEqual(8000);
      expect(outputHeight).toBeLessThanOrEqual(8000);
      expect(outputWidth * outputHeight).toBeLessThanOrEqual(40_000_000);
      expect([source.width, source.height]).toEqual([width, height]);
    },
  );

  it("preserves a fitting PNG at the exact dimension and pixel boundaries", () => {
    source.width = 8000;
    source.height = 5000;
    encodeCanvasPng(source);
    expect(draw).not.toHaveBeenCalled();
  });

  it("reduces repeated oversized encodings from the original pixels", () => {
    const tooLarge = prefix + "a".repeat(MAX_PNG_LENGTH);
    encode.mockReturnValueOnce(tooLarge).mockReturnValueOnce(tooLarge);
    const result = encodeCanvasPng(source);
    expect(result.length).toBeLessThanOrEqual(MAX_PNG_LENGTH);
    expect(draw).toHaveBeenCalledTimes(2);
    for (const args of draw.mock.calls) expect(args[0]).toBe(source);
    const first = draw.mock.calls[0],
      last = draw.mock.calls[1];
    expect(first[3]).toBeLessThan(source.width);
    expect(last[3]).toBeLessThan(first[3]);
    expect(last[3] / last[4]).toBeCloseTo(source.width / source.height, 2);
    expect([source.width, source.height]).toEqual([4096, 2160]);
  });

  it.each([
    [0, 20],
    [20, 0],
    [10000, 10000],
  ])(
    "rejects an invalid or excessive %s by %s source before encoding",
    (width, height) => {
      source.width = width;
      source.height = height;
      expect(() => encodeCanvasPng(source)).toThrow("image_limit");
      expect(encode).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid PNG encoding", () => {
    encode.mockReturnValue("data:,");
    expect(() => encodeCanvasPng(source)).toThrow("image_decode");
  });

  it("fails instead of looping when even one pixel exceeds the budget", () => {
    source.width = source.height = 1;
    encode.mockReturnValue(prefix + "a".repeat(MAX_PNG_LENGTH));
    expect(() => encodeCanvasPng(source)).toThrow("image_limit");
    expect(encode).toHaveBeenCalledOnce();
  });

  it("reports an unavailable fallback drawing context", () => {
    encode.mockReturnValueOnce(prefix + "a".repeat(MAX_PNG_LENGTH));
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(() => encodeCanvasPng(source)).toThrow("image_decode");
  });
});
