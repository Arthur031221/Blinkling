import { imageRect, selectCrop, type CropLabels } from "./crop-selection";
import { encodeCanvasPng } from "./png";

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
  let scaleChanged: (() => void) | undefined;
  let browserWindow:
    | { id: number; state: chrome.windows.Window["state"] }
    | undefined;
  let previousTab: number | undefined;
  let previousWindow: number | undefined;
  let foregroundChanged = false;
  const wasDomFullscreen = Boolean(doc.fullscreenElement);
  try {
    // The caller runs in the opener even when the gesture comes from PiP.
    // The last focused tab/window may instead belong to the shared app.
    const opener = await chrome.tabs.getCurrent();
    if (opener?.id === undefined || opener.windowId === undefined)
      throw new Error("crop_fullscreen_denied");
    const current = await chrome.windows.get(opener.windowId);
    browserWindow = { id: opener.windowId, state: current.state };
    const [active] = await chrome.tabs.query({
      active: true,
      windowId: opener.windowId,
    });
    previousTab = active?.id;
    previousWindow = (await chrome.windows.getLastFocused()).id;
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
      "position:fixed;inset:0;z-index:2147483646;background:#171410;overflow:auto";
    const image = doc.createElement("img");
    image.alt = labels.cropTitle;
    image.src = frame.toDataURL("image/png");
    image.style.cssText = "display:block;max-width:none;max-height:none";
    container.append(image);
    // Freeze first: activating the opener earlier would capture our own UI.
    foregroundChanged = true;
    await chrome.tabs.update(opener.id, { active: true });
    // Fullscreen belongs to the opener, never the small Document PiP window.
    try {
      if (!wasDomFullscreen) await doc.documentElement.requestFullscreen();
    } catch {
      // Global commands need the native fullscreen path without DOM activation.
    }
    try {
      // A resolved DOM request does not guarantee that the native window filled
      // the display. Enforce and check both paths through the extension API.
      await chrome.windows.update(opener.windowId, {
        state: "fullscreen",
        focused: true,
      });
      const deadline = performance.now() + 1500;
      while (true) {
        const native = await chrome.windows.get(opener.windowId);
        if (
          native.state === "fullscreen" &&
          (native.width || 0) >= window.screen.width &&
          (native.height || 0) >= window.screen.height
        )
          break;
        if (performance.now() >= deadline)
          throw new Error("crop_fullscreen_denied");
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
    } catch {
      throw new Error("crop_fullscreen_denied");
    }
    // One captured pixel occupies one physical display pixel, including HiDPI.
    const view = doc.defaultView!;
    const ratio = view.devicePixelRatio || 1;
    image.style.width = `${frame.width / ratio}px`;
    image.style.height = `${frame.height / ratio}px`;
    container.addEventListener(
      "wheel",
      (event) => {
        if (!container) return;
        event.preventDefault();
        container.scrollBy(
          event.shiftKey ? event.deltaX || event.deltaY : event.deltaX,
          event.shiftKey ? 0 : event.deltaY,
        );
      },
      { passive: false },
    );
    scaleChanged = () => {
      if ((view.devicePixelRatio || 1) !== ratio)
        view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    };
    view.addEventListener("resize", scaleChanged);
    if (bubble) bubble.body.style.opacity = ".25";
    await image.decode();
    doc.body.append(container);
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
    return encodeCanvasPng(result);
  } catch (error) {
    if (
      error instanceof DOMException &&
      ["NotAllowedError", "TypeError"].includes(error.name)
    )
      throw new Error("crop_fullscreen_denied");
    throw error;
  } finally {
    if (scaleChanged)
      doc.defaultView?.removeEventListener("resize", scaleChanged);
    container?.remove();
    if (!wasDomFullscreen && doc.fullscreenElement)
      await doc.exitFullscreen().catch(() => {});
    if (browserWindow && foregroundChanged)
      await chrome.windows
        .update(browserWindow.id, { state: browserWindow.state })
        .catch(() => {});
    if (foregroundChanged && previousTab !== undefined)
      await chrome.tabs.update(previousTab, { active: true }).catch(() => {});
    if (foregroundChanged && previousWindow !== undefined)
      await chrome.windows
        .update(previousWindow, { focused: true })
        .catch(() => {});
    if (bubble) bubble.body.style.opacity = oldOpacity;
    frame.width = 0;
    frame.height = 0;
  }
}
