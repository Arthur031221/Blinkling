import { desktopCapturer } from "electron";
import { randomUUID } from "node:crypto";
/** Serialize calls in the owning service; every owned window must be passed here. */
export async function captureScreen(display, windows) {
  const visible = windows.filter((w) => !w.isDestroyed() && w.isVisible());
  try {
    visible.forEach((w) => w.hide());
    // Measured compositor settling barrier; permission/portal flow is still pending.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor),
      },
    });
    const source =
      sources.find((s) => s.display_id === String(display.id)) ??
      (sources.length === 1 ? sources[0] : undefined);
    if (!source || source.thumbnail.isEmpty())
      throw new Error("Screen capture unavailable");
    const size = source.thumbnail.getSize();
    return {
      id: randomUUID(),
      display: {
        id: String(display.id),
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
      },
      region: {
        x: 0,
        y: 0,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      pixelWidth: size.width,
      pixelHeight: size.height,
      capturedAt: Date.now(),
      image: {
        id: randomUUID(),
        name: "Screenshot.png",
        mediaType: "image/png",
        data: source.thumbnail.toPNG().toString("base64"),
      },
    };
  } finally {
    visible.filter((w) => !w.isDestroyed()).forEach((w) => w.showInactive());
  }
}
export async function selectRegion() {
  throw new Error("Region selection is not implemented");
}
export async function captureFullPage() {
  return { companionRequired: true };
}
