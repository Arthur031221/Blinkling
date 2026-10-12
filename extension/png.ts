export const MAX_PNG_LENGTH = 5_000_000;
const MAX_EDGE = 8_000;
const MAX_PIXELS = 40_000_000;

export function encodeCanvasPng(source: HTMLCanvasElement): string {
  if (
    !source.width ||
    !source.height ||
    source.width * source.height > 90_000_000
  )
    throw new Error("image_limit");
  let canvas = source;
  let scale = 1;
  while (true) {
    const image = canvas.toDataURL("image/png");
    if (!image.startsWith("data:image/png;base64,"))
      throw new Error("image_decode");
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
    if (canvas === source)
      canvas = source.ownerDocument.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(source.width * scale));
    canvas.height = Math.max(1, Math.floor(source.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_decode");
    // Always resample the original so retries do not compound image degradation.
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
}
