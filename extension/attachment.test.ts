import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachmentToPng } from "./attachment";

describe("image attachment normalization", () => {
  let bitmap: {
    width: number;
    height: number;
    close: ReturnType<typeof vi.fn>;
  };
  let draw: ReturnType<typeof vi.fn>;
  let encode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bitmap = { width: 100, height: 80, close: vi.fn() };
    draw = vi.fn();
    encode = vi.fn().mockReturnValue("data:image/png;base64,aGVsbG8=");
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      encode,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])(
    "normalizes %s and releases the decoded bitmap",
    async (type) => {
      const result = await attachmentToPng(
        new File(["image"], "image", { type }),
      );
      expect(result).toMatch(/^data:image\/png;base64,/);
      expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 100, 80);
      expect(encode).toHaveBeenCalledWith("image/png");
      expect(bitmap.close).toHaveBeenCalledOnce();
    },
  );

  it("rejects unsupported and oversized files before decoding", async () => {
    await expect(
      attachmentToPng(
        new File(["svg"], "image.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow("image_format");
    const file = new File(["image"], "image.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 20_000_001 });
    await expect(attachmentToPng(file)).rejects.toThrow("image_limit");
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("reports a damaged image before a preview is created", async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error("Decode failed"));
    await expect(
      attachmentToPng(new File(["broken"], "image.png", { type: "image/png" })),
    ).rejects.toThrow("image_decode");
  });

  it("reduces the edge and encoded size to fit request limits", async () => {
    bitmap.width = 4096;
    bitmap.height = 2048;
    encode.mockReturnValueOnce(
      "data:image/png;base64," + "a".repeat(5_000_000),
    );
    const image = await attachmentToPng(
      new File(["image"], "image.png", { type: "image/png" }),
    );
    expect(draw.mock.calls.map((args) => args.slice(3))).toEqual([
      [2048, 1024],
      [1024, 512],
    ]);
    expect(image.length).toBeLessThanOrEqual(5_000_000);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("rejects an excessive decoded canvas and releases its bitmap", async () => {
    bitmap.width = 10000;
    bitmap.height = 10000;
    await expect(
      attachmentToPng(new File(["image"], "image.png", { type: "image/png" })),
    ).rejects.toThrow("image_limit");
    expect(draw).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
