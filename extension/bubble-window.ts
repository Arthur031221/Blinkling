import type { BlinkDock } from "./bubble-surface";

export type BubblePosition = {
  left: number;
  top: number;
  width?: number;
  height?: number;
};

export function screenArea(floating: Window) {
  const screen = floating.screen as Screen & {
    availLeft?: number;
    availTop?: number;
  };
  return {
    left: screen.availLeft || 0,
    top: screen.availTop || 0,
    width: screen.availWidth,
    height: screen.availHeight,
  };
}

/** Extensions can move their native PiP window through chrome.windows even
 * though Document PiP disables window.moveTo. Chrome still clamps its size. */
export async function placeBubbleWindow(
  floating: Window,
  destination: BlinkDock | BubblePosition,
  isCurrent: () => boolean,
) {
  const opener = await chrome.tabs.getCurrent();
  if (opener?.id === undefined || !chrome.windows.getAll) return;
  const windows = await chrome.windows.getAll({ populate: true });
  let native = windows.find(
    (window) =>
      window.alwaysOnTop &&
      window.tabs?.some(
        (tab) => tab.url === "about:blank" && tab.openerTabId === opener.id,
      ),
  );
  if (native?.id === undefined || floating.closed || !isCurrent()) return;
  if (!("edge" in destination)) {
    await chrome.windows.update(native.id, {
      left: Math.round(destination.left),
      top: Math.round(destination.top),
      ...(destination.width === undefined
        ? {}
        : { width: Math.round(destination.width) }),
      ...(destination.height === undefined
        ? {}
        : { height: Math.round(destination.height) }),
    });
    return;
  }
  native = await chrome.windows.update(native.id, {
    width: Math.round(72 + floating.outerWidth - floating.innerWidth),
    height: Math.round(72 + floating.outerHeight - floating.innerHeight),
  });
  if (floating.closed || !isCurrent() || native.id === undefined) return;
  const area = screenArea(floating);
  const width = native.width || floating.outerWidth;
  const height = native.height || floating.outerHeight;
  const top =
    destination.edge === "bottom"
      ? area.top + area.height - height
      : area.top +
        Math.max(
          0,
          Math.min(
            area.height - height,
            destination.y * area.height - height / 2,
          ),
        );
  await chrome.windows.update(native.id, {
    // Chrome requires at least half the native rectangle on a display. Tuck
    // the unused half away; CSS alone cannot shrink the browser's minimum.
    left: Math.floor(area.left + area.width - Math.ceil(width / 2)),
    top: Math.round(top),
  });
}
