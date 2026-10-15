import { cropGeometry } from "../capture/core.mjs";

/** Longest side of a flight thumbnail in pixels: 96 DIP at the densest screens. */
const THUMBNAIL_PIXELS = 192;

/** Cuts picked areas out of one screen grab. The grab is decoded once; each cut
 * returns the full-resolution PNG for the attachment and a small data URL for
 * the flight, so the layer page never receives a screen-sized image. `rect` is in
 * the capture's own DIP space (origin at the capture region). */
export function createCropper({ nativeImage }) {
  const decoded = new WeakMap();
  return function crop(capture, rect) {
    let image = decoded.get(capture);
    if (!image) {
      image = nativeImage.createFromBuffer(
        Buffer.from(capture.image.data, "base64"),
      );
      decoded.set(capture, image);
    }
    const piece = image.crop(cropGeometry(rect, capture));
    const size = piece.getSize();
    const scale = Math.min(
      1,
      THUMBNAIL_PIXELS / Math.max(size.width, size.height),
    );
    const small =
      scale < 1
        ? piece.resize({
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)),
          })
        : piece;
    return {
      data: piece.toPNG().toString("base64"),
      width: size.width,
      height: size.height,
      dataUrl: `data:image/png;base64,${small.toPNG().toString("base64")}`,
    };
  };
}
