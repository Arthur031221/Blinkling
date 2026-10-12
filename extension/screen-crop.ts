import { imageRect, selectCrop, type CropLabels } from "./crop-selection";

export async function cropSharedScreen(
  video: HTMLVideoElement,
  bubble: Document | null,
  labels: CropLabels,
): Promise<string | null> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("share_ended");
  const doc = document;
  const oldOpacity = bubble?.body.style.opacity || "";
  if (bubble) bubble.body.style.opacity = "0";
  const frame = doc.createElement("canvas");
  frame.width = video.videoWidth;
  frame.height = video.videoHeight;
  let container: HTMLDivElement | undefined;
  let browserWindow:
    | { id: number; state: chrome.windows.Window["state"] }
    | undefined;
  try {
    // Two paints let the outgoing share observe the hidden bubble before freezing.
    await Promise.race([
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
      new Promise<void>((resolve) => window.setTimeout(resolve, 80)),
    ]);
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 700);
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
    const context = frame.getContext("2d");
    if (!context) throw new Error("capture_failed");
    context.drawImage(video, 0, 0);
    container = doc.createElement("div");
    container.dataset.glimpseletFrozenCrop = "true";
    container.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:#171410;display:grid;place-items:center";
    const image = doc.createElement("img");
    image.alt = labels.cropTitle;
    image.src = frame.toDataURL("image/png");
    image.style.cssText =
      "display:block;max-width:100vw;max-height:100vh;object-fit:contain;width:auto;height:auto";
    container.append(image);
    doc.body.append(container);
    // Fullscreen belongs to the opener, never the small Document PiP window.
    try {
      await doc.documentElement.requestFullscreen();
    } catch {
      // Global commands have no DOM activation. Browser fullscreen still
      // provides a full screen selector outside the bubble.
      const current = await chrome.windows.getCurrent();
      if (current.id === undefined) throw new Error("crop_fullscreen_denied");
      browserWindow = { id: current.id, state: current.state };
      await chrome.windows.update(current.id, {
        state: "fullscreen",
        focused: true,
      });
    }
    if (bubble) bubble.body.style.opacity = ".25";
    await image.decode();
    const host = doc.createElement("div");
    container.append(host);
    const rect = await selectCrop(
      host,
      () => image.getBoundingClientRect(),
      labels,
      frame.width / image.getBoundingClientRect().width,
    );
    if (!rect) return null;
    const area = imageRect(rect, image.getBoundingClientRect(), frame);
    const result = doc.createElement("canvas");
    result.width = area.width;
    result.height = area.height;
    result
      .getContext("2d")!
      .drawImage(
        frame,
        area.x,
        area.y,
        area.width,
        area.height,
        0,
        0,
        area.width,
        area.height,
      );
    return result.toDataURL("image/png");
  } catch (error) {
    if (
      error instanceof DOMException &&
      ["NotAllowedError", "TypeError"].includes(error.name)
    )
      throw new Error("crop_fullscreen_denied");
    throw error;
  } finally {
    container?.remove();
    if (doc.fullscreenElement) await doc.exitFullscreen().catch(() => {});
    if (browserWindow)
      await chrome.windows
        .update(browserWindow.id, { state: browserWindow.state })
        .catch(() => {});
    if (bubble) bubble.body.style.opacity = oldOpacity;
    frame.width = 0;
    frame.height = 0;
  }
}
