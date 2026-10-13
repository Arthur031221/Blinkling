import { imageRect, selectCrop, type CropLabels } from "./crop-selection";
import { encodeCanvasPng } from "./png";
import {
  freezeSharedFrame,
  needsSharedFrameClearance,
  withBubbleCleared,
  type SharedFrameOptions,
} from "./screen-frame";

export async function cropSharedScreen(
  video: HTMLVideoElement,
  bubble: Document | null,
  labels: CropLabels,
  options: SharedFrameOptions = {},
): Promise<string | null> {
  const controller = new AbortController();
  const tracks =
    (video.srcObject as MediaStream | null)?.getVideoTracks() || [];
  const ended = () => controller.abort(new Error("share_ended"));
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const frameOptions = {
    ...options,
    clearBubble: needsSharedFrameClearance(video, bubble)
      ? options.clearBubble
      : undefined,
    signal,
  };
  tracks.forEach((track) => track.addEventListener("ended", ended));
  try {
    return await withBubbleCleared(video, bubble, frameOptions, () =>
      cropFrozenFrame(video, bubble, labels, frameOptions),
    );
  } finally {
    tracks.forEach((track) => track.removeEventListener("ended", ended));
  }
}

async function cropFrozenFrame(
  video: HTMLVideoElement,
  bubble: Document | null,
  labels: CropLabels,
  options: SharedFrameOptions,
): Promise<string | null> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("share_ended");
  const doc = document;
  const oldOpacity = bubble?.body.style.opacity || "";
  if (bubble) bubble.body.style.opacity = "0";
  let frame = doc.createElement("canvas");
  let container: HTMLDivElement | undefined;
  let scaleChanged: (() => void) | undefined;
  let browserWindow:
    | { id: number; state: chrome.windows.Window["state"] }
    | undefined;
  let previousTab: number | undefined;
  let previousWindow: number | undefined;
  let foregroundChanged = false;
  let fullscreenStateChanged = false;
  const wasDomFullscreen = Boolean(doc.fullscreenElement);
  const cancelSelection = () =>
    doc.defaultView?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" }),
    );
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
    frame = await freezeSharedFrame(video, null, { signal: options.signal });
    options.signal?.throwIfAborted();
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
      if (!wasDomFullscreen) {
        fullscreenStateChanged = true;
        await doc.documentElement.requestFullscreen();
      }
    } catch {
      // Global commands need the native fullscreen path without DOM activation.
    }
    try {
      // A resolved DOM request does not guarantee that the native window filled
      // the display. Inspect both paths through the extension API. Overlapping
      // DOM and native fullscreen transitions can revert the window's bounds.
      const fillsScreen = (native: chrome.windows.Window) =>
        native.state === "fullscreen" &&
        (native.width || 0) >= window.screen.width &&
        (native.height || 0) >= window.screen.height;
      if (fillsScreen(await chrome.windows.get(opener.windowId))) {
        await chrome.windows.update(opener.windowId, { focused: true });
      } else {
        if (!wasDomFullscreen && doc.fullscreenElement)
          await doc.exitFullscreen();
        fullscreenStateChanged = true;
        await chrome.windows.update(opener.windowId, {
          state: "fullscreen",
          focused: true,
        });
      }
      const deadline = performance.now() + 1500;
      while (true) {
        options.signal?.throwIfAborted();
        const native = await chrome.windows.get(opener.windowId);
        if (fillsScreen(native)) break;
        if (performance.now() >= deadline)
          throw new Error("crop_fullscreen_denied");
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
    } catch {
      options.signal?.throwIfAborted();
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
    if (bubble && !options.clearBubble) bubble.body.style.opacity = ".25";
    await image.decode();
    options.signal?.throwIfAborted();
    doc.body.append(container);
    const host = doc.createElement("div");
    container.append(host);
    options.signal?.addEventListener("abort", cancelSelection, { once: true });
    const rect = await selectCrop(
      host,
      () => image.getBoundingClientRect(),
      labels,
      frame.width / image.getBoundingClientRect().width,
    );
    options.signal?.throwIfAborted();
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
    options.signal?.removeEventListener("abort", cancelSelection);
    if (scaleChanged)
      doc.defaultView?.removeEventListener("resize", scaleChanged);
    container?.remove();
    if (!wasDomFullscreen && doc.fullscreenElement)
      await doc.exitFullscreen().catch(() => {});
    if (browserWindow && fullscreenStateChanged)
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
