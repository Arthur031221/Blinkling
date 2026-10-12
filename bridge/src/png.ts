import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import {
  DEFAULT_LONG_EDGE,
  MAX_PIXELS,
  MAX_PNG_BYTES,
  MAX_LONG_EDGE,
  positiveInteger,
} from "./config.js";

export type NormalizedPng = {
  image: Buffer;
  width: number;
  height: number;
  signature: string;
};

export function normalizePng(
  input: Buffer,
  requestedLongEdge = DEFAULT_LONG_EDGE,
): NormalizedPng {
  if (input.length < 33 || input.length > MAX_PNG_BYTES)
    throw new Error("PNG must be between 33 bytes and 8 MiB");
  if (
    !input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error("Capture is not a PNG");
  const headerWidth = input.readUInt32BE(16),
    headerHeight = input.readUInt32BE(20);
  if (!headerWidth || !headerHeight || headerWidth * headerHeight > MAX_PIXELS)
    throw new Error("PNG dimensions exceed the pixel limit");
  let decoded: PNG;
  try {
    decoded = PNG.sync.read(input, { skipRescale: true });
  } catch {
    throw new Error("PNG data is invalid");
  }
  if (decoded.width !== headerWidth || decoded.height !== headerHeight)
    throw new Error("PNG dimensions are inconsistent");
  const edge = positiveInteger(
    requestedLongEdge,
    DEFAULT_LONG_EDGE,
    MAX_LONG_EDGE,
  );
  const scale = Math.min(1, edge / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale)),
    height = Math.max(1, Math.round(decoded.height * scale));
  let normalized = decoded;
  if (scale < 1) {
    const output = new PNG({ width, height });
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const sx = Math.min(decoded.width - 1, Math.floor(x / scale)),
          sy = Math.min(decoded.height - 1, Math.floor(y / scale));
        decoded.data.copy(
          output.data,
          (y * width + x) * 4,
          (sy * decoded.width + sx) * 4,
          (sy * decoded.width + sx) * 4 + 4,
        );
      }
    normalized = output;
  }
  const image = PNG.sync.write(normalized, { colorType: 6 });
  if (image.length > MAX_PNG_BYTES)
    throw new Error("Normalized PNG exceeds the byte limit");
  const signature = createHash("sha256").update(normalized.data).digest("hex");
  return { image, width, height, signature };
}
