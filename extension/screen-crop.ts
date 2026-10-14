import { imageRect, selectCrop, type CropLabels } from "./crop-selection";
import { encodeCanvasPng } from "./png";
import {
  freezeSharedFrame,
  withBubbleCleared,
  type SharedFrameOptions,
} from "./screen-frame";

export async function cropSharedScreen(
  video: HTMLVideoElement,
  bubble: Document | null,
  labels: CropLabels,
  options: SharedFrameOptions & { sourceTabId?: number } = {},
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
    clearForSelection: true,
    signal,
  };
  tracks.forEach((track) => track.addEventListener("ended", ended));
  try {
    // Closing native PiP can activate its opener. Preserve the user's page
    // before clearance performs that transition, rather than after hiding.
    const foreground = await chrome.windows.getLastFocused();
    // A real PiP click focuses its native widget. That window may be closed
    // for clearance, so return to the page associated with the bubble instead.
    const source =
      foreground.alwaysOnTop && options.sourceTabId !== undefined
        ? await chrome.tabs.get(options.sourceTabId).catch(() => undefined)
        : undefined;
    const previousWindow = source?.windowId ?? foreground.id;
    return await withBubbleCleared(video, bubble, frameOptions, () =>
      cropFrozenFrame(video, bubble, labels, frameOptions, previousWindow),
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
  previousWindow: number | undefined,
): Promise<string | null> {
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
  let foregroundChanged = false;
  let fullscreenStateChanged = false;
  let stopNativeObserver: (() => void) | undefined;
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
    frame = await freezeSharedFrame(video, null, { signal: options.signal });
    await options.clearBubble?.prepareSelection?.();
    options.signal?.throwIfAborted();
    container = doc.createElement("div");
    container.dataset.blinklingFrozenCrop = "true";
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
    await chrome.windows.update(opener.windowId, { focused: true });
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
      let native = await chrome.windows.get(opener.windowId);
      // requestFullscreen resolves before Chrome publishes settled native
      // bounds. Let that transition finish before attempting a second one.
      const domDeadline = performance.now() + 400;
      while (
        doc.fullscreenElement &&
        !fillsScreen(native) &&
        performance.now() < domDeadline
      ) {
        options.signal?.throwIfAborted();
        await new Promise((resolve) => window.setTimeout(resolve, 40));
        native = await chrome.windows.get(opener.windowId);
      }
      if (fillsScreen(native)) {
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
    const selection = selectCrop(
      host,
      () => image.getBoundingClientRect(),
      labels,
      frame.width / image.getBoundingClientRect().width,
    );
    // Chrome can consume the first Escape while exiting native fullscreen,
    // without dispatching a DOM key or fullscreenchange event. Observe that
    // native transition rather than requiring a second Escape.
    const nativeChanged = (native: chrome.windows.Window) => {
      if (
        native.id === browserWindow?.id &&
        native.state &&
        native.state !== "fullscreen"
      )
        cancelSelection();
    };
    chrome.windows.onBoundsChanged?.addListener(nativeChanged);
    stopNativeObserver = () =>
      chrome.windows.onBoundsChanged?.removeListener(nativeChanged);
    options.clearBubble?.relaySelection?.(host, image);
    const rect = await selection;
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
    stopNativeObserver?.();
    options.signal?.removeEventListener("abort", cancelSelection);
    // Record focus before native restoration can activate the opener. If the
    // user moved to another Chrome window during selection, keep that window.
    const foreground = foregroundChanged
      ? await chrome.windows.getLastFocused().catch(() => undefined)
      : undefined;
    const restoreFocus =
      foreground?.focused && foreground.id !== browserWindow?.id
        ? foreground.id
        : foreground?.focused === false
          ? undefined
          : previousWindow;
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
    if (foregroundChanged && restoreFocus !== undefined)
      await chrome.windows
        .update(restoreFocus, { focused: true })
        .then(async () => {
          // Restore can acknowledge its state before the window manager raises
          // the opener. Require settled focus so that late activation cannot
          // undo the user's intervening window choice.
          const deadline = performance.now() + 2000;
          let stableSince = performance.now();
          while (performance.now() - stableSince < 200) {
            await new Promise((resolve) => window.setTimeout(resolve, 40));
            if (!(await chrome.windows.get(restoreFocus)).focused) {
              const current = await chrome.windows.getLastFocused();
              // Respect a new user choice, including another application.
              if (!current.focused || current.id !== browserWindow?.id) break;
              await chrome.windows.update(restoreFocus, { focused: true });
              stableSince = performance.now();
            }
            if (performance.now() >= deadline) break;
          }
        })
        .catch(() => {});
    if (bubble) bubble.body.style.opacity = oldOpacity;
    frame.width = 0;
    frame.height = 0;
  }
}
