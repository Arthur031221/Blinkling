import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCanvasPng, MAX_PNG_LENGTH } from "./png";

const prefix = "data:image/png;base64,";

class FakeCanvas {
  static draws = vi.fn();
  static encoded: (canvas: FakeCanvas) => number = () => 5;
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return { drawImage: FakeCanvas.draws };
  }
  async convertToBlob() {
    const bytes = new Uint8Array(FakeCanvas.encoded(this));
    return { arrayBuffer: async () => bytes.buffer };
  }
}

describe("capture PNG budget", () => {
  beforeEach(() => {
    FakeCanvas.draws = vi.fn();
    FakeCanvas.encoded = () => 5;
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  });
  afterEach(() => vi.unstubAllGlobals());
  const canvas = (width: number, height: number) =>
    new FakeCanvas(width, height) as unknown as OffscreenCanvas;

  it("keeps native dimensions when the PNG fits", async () => {
    const source = canvas(4096, 2160);
    const image = await encodeCanvasPng(source);
    expect(image.startsWith(prefix)).toBe(true);
    expect(atob(image.slice(prefix.length))).toHaveLength(5);
    expect(FakeCanvas.draws).not.toHaveBeenCalled();
  });

  it("accepts the exact transport boundary", async () => {
    // base64 expands three bytes to four characters.
    const bytes = Math.floor((MAX_PNG_LENGTH - prefix.length) / 4) * 3;
    FakeCanvas.encoded = () => bytes;
    const image = await encodeCanvasPng(canvas(4096, 2160));
    expect(image.length).toBeLessThanOrEqual(MAX_PNG_LENGTH);
    expect(FakeCanvas.draws).not.toHaveBeenCalled();
  });

  it.each([
    [10000, 5000],
    [8000, 6000],
    [10000, 20],
  ])(
    "bounds a compressible %s by %s PNG for the transport",
    async (width, height) => {
      await encodeCanvasPng(canvas(width, height));
      expect(FakeCanvas.draws).toHaveBeenCalledOnce();
      const [, , , outputWidth, outputHeight] = FakeCanvas.draws.mock.calls[0];
      expect(outputWidth).toBeLessThanOrEqual(8000);
      expect(outputHeight).toBeLessThanOrEqual(8000);
      expect(outputWidth * outputHeight).toBeLessThanOrEqual(40_000_000);
    },
  );

  it("resamples the original again when the encoding is still too large", async () => {
    FakeCanvas.encoded = (c) => (c.width > 3000 ? 4_000_000 : 100);
    const image = await encodeCanvasPng(canvas(4096, 2160));
    expect(image.startsWith(prefix)).toBe(true);
    expect(FakeCanvas.draws.mock.calls.length).toBeGreaterThan(0);
    for (const call of FakeCanvas.draws.mock.calls)
      expect(call[0]).toMatchObject({ width: 4096, height: 2160 });
  });

  it("refuses an image it cannot shrink and an empty one", async () => {
    FakeCanvas.encoded = () => 6_000_000;
    await expect(encodeCanvasPng(canvas(8, 8))).rejects.toThrow("image_limit");
    await expect(encodeCanvasPng(canvas(0, 8))).rejects.toThrow("image_limit");
  });
});
