import { PNG } from "pngjs";
import { MAX_PNG_BYTES } from "./config.js";
import { PanelError } from "./errors.js";
import { normalizePng, type NormalizedPng } from "./png.js";

export function readPanelImage(value: unknown): NormalizedPng {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((MAX_PNG_BYTES * 4) / 3) + 128
  )
    throw new PanelError("image_limit", "The PNG image exceeds 8 MiB.", 413);
  const encoded = value.replace(/^data:image\/png;base64,/, "");
  // A flat scan avoids regex stack overflow on multi-megabyte PNG uploads.
  const unpadded = encoded.endsWith("==")
    ? encoded.slice(0, -2)
    : encoded.endsWith("=")
      ? encoded.slice(0, -1)
      : encoded;
  if (!encoded || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(unpadded))
    throw new PanelError("invalid_image", "Supply a valid PNG image.");
  try {
    return normalizePng(Buffer.from(encoded, "base64"));
  } catch {
    throw new PanelError(
      "invalid_image",
      "The PNG image is invalid or exceeds its dimension limit.",
    );
  }
}

export type FrameSample = { width: number; height: number; pixels: Uint8Array };

export function sampleFrame(image: Buffer): FrameSample {
  const png = PNG.sync.read(image);
  const pixels = new Uint8Array(16 * 16 * 3);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const left = Math.min(png.width - 1, Math.floor((x * png.width) / 16));
      const top = Math.min(png.height - 1, Math.floor((y * png.height) / 16));
      const right = Math.min(
        png.width,
        Math.max(left + 1, Math.floor(((x + 1) * png.width) / 16)),
      );
      const bottom = Math.min(
        png.height,
        Math.max(top + 1, Math.floor(((y + 1) * png.height) / 16)),
      );
      const sums = [0, 0, 0];
      for (let sy = top; sy < bottom; sy++)
        for (let sx = left; sx < right; sx++) {
          const offset = (sy * png.width + sx) * 4;
          for (let channel = 0; channel < 3; channel++)
            sums[channel]! += png.data[offset + channel]!;
        }
      const count = (right - left) * (bottom - top);
      for (let channel = 0; channel < 3; channel++)
        pixels[(y * 16 + x) * 3 + channel] = Math.round(sums[channel]! / count);
    }
  return { width: png.width, height: png.height, pixels };
}

export function hasFrameChanged(
  previous: FrameSample | undefined,
  current: FrameSample,
): boolean {
  if (
    !previous ||
    previous.width !== current.width ||
    previous.height !== current.height
  )
    return true;
  let changed = 0;
  for (let i = 0; i < current.pixels.length; i += 3) {
    if (
      Math.max(
        ...[0, 1, 2].map((channel) =>
          Math.abs(
            current.pixels[i + channel]! - previous.pixels[i + channel]!,
          ),
        ),
      ) >= 18
    )
      changed++;
  }
  return changed >= 3;
}
