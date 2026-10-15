export const MAX_PNG_LENGTH = 5_000_000;
const MAX_EDGE = 8_000;
const MAX_PIXELS = 40_000_000;

/** The browser's PNG encoding of a canvas, as a data URL. */
async function dataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * A PNG data URL that fits the transport: shrunk step by step from the
 * original until it is small enough, never compounding resampling.
 */
export async function encodeCanvasPng(
  source: OffscreenCanvas,
): Promise<string> {
  if (
    !source.width ||
    !source.height ||
    source.width * source.height > 90_000_000
  )
    throw new Error("image_limit");
  let canvas = source;
  let scale = 1;
  while (true) {
    const image = await dataUrl(canvas);
    if (
      image.length <= MAX_PNG_LENGTH &&
      canvas.width <= MAX_EDGE &&
      canvas.height <= MAX_EDGE &&
      canvas.width * canvas.height <= MAX_PIXELS
    )
      return image;
    if (canvas.width === 1 && canvas.height === 1)
      throw new Error("image_limit");
    scale *= 0.8;
    const width = Math.max(1, Math.floor(source.width * scale));
    const height = Math.max(1, Math.floor(source.height * scale));
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_decode");
    // Always resample the original so retries do not compound image degradation.
    context.drawImage(source, 0, 0, width, height);
  }
}
