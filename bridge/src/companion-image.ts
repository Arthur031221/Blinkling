import { MAX_PNG_BYTES } from "./config.js";
import { normalizePng, type NormalizedPng } from "./png.js";

/** A PNG sent by the companion: base64, bounded, decoded and re-encoded. */
export function readCompanionImage(
  value: unknown,
  longEdge?: number,
): NormalizedPng {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((MAX_PNG_BYTES * 4) / 3) + 128
  )
    throw new Error("The PNG image exceeds 8 MiB.");
  const encoded = value.replace(/^data:image\/png;base64,/, "");
  // A flat scan avoids regex stack overflow on multi-megabyte PNG uploads.
  const unpadded = encoded.endsWith("==")
    ? encoded.slice(0, -2)
    : encoded.endsWith("=")
      ? encoded.slice(0, -1)
      : encoded;
  if (!encoded || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(unpadded))
    throw new Error("Supply a valid PNG image.");
  return normalizePng(Buffer.from(encoded, "base64"), longEdge);
}
