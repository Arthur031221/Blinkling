import type { SharedFrameOptions } from "./screen-frame";
import { relayBubbleCropInput } from "./bubble-crop-input";

const pendingClearance = new WeakMap<Window, Promise<void>>();

export type BubbleReplacement = {
  close: () => void;
  open: () => Promise<Window>;
};

// Chrome exposes Document PiP as an always-on-top native window. Minimizing it
// clears the window chrome as well as its content, without losing the portal,
// user activation, decoder, conversation or the browser's window placement.
export function nativeBubbleClearance(
  floating: Window,
  replacement?: BubbleReplacement,
): NonNullable<SharedFrameOptions["clearBubble"]> {
  let original: chrome.windows.Window | undefined;
  let changed = false;
  let release: (() => void) | undefined;
  let replace = false;
  let replacementWindow: Window | undefined;
  let selectionOpacity: string | undefined;
  let stopSelectionRelay: (() => void) | undefined;
  const showReplacement = async () => {
    if (!replace || replacementWindow) return;
    const foreground = (await chrome.windows.getAll()).find((w) => w.focused);
    replacementWindow = await replacement!.open();
    const opener = await chrome.tabs.getCurrent();
    const native = (await chrome.windows.getAll({ populate: true })).find(
      (w) =>
        w.alwaysOnTop && w.tabs?.some((tab) => tab.openerTabId === opener?.id),
    );
    if (native?.id === undefined) throw new Error("capture_bubble_obstructed");
    await chrome.windows.update(native.id, {
      left: original!.left,
      top: original!.top,
      width: original!.width,
      height: original!.height,
    });
    if (foreground?.id !== undefined)
      await chrome.windows.update(foreground.id, { focused: true });
  };
  const waitForState = async (state: chrome.windows.Window["state"]) => {
    const deadline = performance.now() + 2000;
    while (!floating.closed && original?.id !== undefined) {
      if ((await chrome.windows.get(original.id)).state === state) return;
      if (performance.now() >= deadline) break;
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
    throw new Error("capture_bubble_obstructed");
  };
  return {
    hide: async () => {
      const previous = pendingClearance.get(floating);
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      pendingClearance.set(floating, pending);
      await previous;
      const opener = await chrome.tabs.getCurrent();
      const windows = await chrome.windows.getAll({ populate: true });
      original = windows.find(
        (native) =>
          native.alwaysOnTop &&
          native.tabs?.some(
            (tab) =>
              opener?.id !== undefined &&
              tab.openerTabId === opener.id &&
              tab.url === "about:blank",
          ),
      );
      if (original?.id === undefined || floating.closed)
        throw new Error("capture_bubble_obstructed");
      if (original.state !== "minimized") {
        // Mark before updating so even a partial native transition rolls back.
        changed = true;
        try {
          await chrome.windows.update(original.id, { state: "minimized" });
        } catch (error) {
          // New Chromium releases forbid minimizing Document PiP. Only close
          // it when the initiating gesture can also reopen it automatically.
          if (
            !String(error).includes(
              "Operation not allowed for picture-in-picture windows",
            )
          )
            throw error;
          changed = false;
          if (!replacement || !navigator.userActivation.isActive)
            throw new Error("capture_bubble_obstructed");
          replace = true;
          replacement.close();
          if (!floating.closed) throw new Error("capture_bubble_obstructed");
          return true;
        }
      }
      // windows.update resolves before the native window manager completes.
      await waitForState("minimized");
      return true;
    },
    prepareSelection: async () => {
      // Reopen before fullscreen consumes the gesture, rather than waiting
      // for Escape (which does not grant activation) or a long selection.
      if (!replace) return;
      await showReplacement();
      selectionOpacity = replacementWindow!.document.body.style.opacity;
      replacementWindow!.document.body.style.opacity = ".25";
    },
    relaySelection: (host) => {
      if (replacementWindow)
        stopSelectionRelay = relayBubbleCropInput(replacementWindow, host);
    },
    restore: async () => {
      try {
        stopSelectionRelay?.();
        if (replace) {
          await showReplacement();
          if (
            selectionOpacity !== undefined &&
            replacementWindow &&
            !replacementWindow.closed
          )
            replacementWindow.document.body.style.opacity = selectionOpacity;
          return;
        }
        if (!changed || original?.id === undefined || floating.closed) return;
        const bubbleId = original.id;
        const foreground = (await chrome.windows.getAll()).find(
          (native) => native.focused && native.id !== original?.id,
        );
        await chrome.windows.update(original.id, {
          state: original.state || "normal",
        });
        await waitForState(original.state || "normal");
        // Native restoration is asynchronous. Deactivating in the same update
        // runs too early and Chrome subsequently focuses the restored bubble.
        // Handle focus only after restoration. Preserve the current Chrome
        // window when there is one; otherwise restore the initial bubble focus.
        // Chrome cannot identify or explicitly focus a non-browser application.
        if (foreground?.id !== undefined)
          await chrome.windows
            .update(foreground.id, { focused: true })
            .catch(() => chrome.windows.update(bubbleId, { focused: false }));
        else
          await chrome.windows.update(original.id, {
            focused: Boolean(original.focused),
          });
      } finally {
        release?.();
      }
    },
  };
}
