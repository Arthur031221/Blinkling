/** Which browser window and tab a request from Blink is about. */
export type TabTarget = {
  tab: chrome.tabs.Tab & { id: number; windowId: number; url: string };
  window: chrome.windows.Window;
};

const RESTRICTED =
  /^(chrome|edge|about|devtools|view-source|chrome-extension|chrome-search|chrome-untrusted|moz-extension):/i;

/** Pages an extension cannot read, the PDF viewer and the Web Store included. */
export function readablePage(url: string | undefined): boolean {
  if (!url || RESTRICTED.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (!/^(https?|file|ftp):$/.test(parsed.protocol)) return false;
    if (
      parsed.hostname === "chromewebstore.google.com" ||
      (parsed.hostname === "chrome.google.com" &&
        parsed.pathname.startsWith("/webstore"))
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

const contains = (
  window: chrome.windows.Window,
  point: { x: number; y: number },
) =>
  window.state !== "minimized" &&
  window.left !== undefined &&
  window.top !== undefined &&
  window.width !== undefined &&
  window.height !== undefined &&
  point.x >= window.left &&
  point.x < window.left + window.width &&
  point.y >= window.top &&
  point.y < window.top + window.height;

/**
 * The window under a screen point (DIP), or the last focused one without a
 * point, with its active tab. Undefined when no browser window is there.
 */
export async function targetTab(point?: {
  x: number;
  y: number;
}): Promise<TabTarget | undefined> {
  const windows = (
    await chrome.windows.getAll({
      populate: true,
      windowTypes: ["normal", "popup"],
    })
  ).filter((w) => w.state !== "minimized");
  let chosen: chrome.windows.Window | undefined;
  if (point) {
    const under = windows.filter((w) => contains(w, point));
    // Overlapping windows: the focused one is on top, then the last one used.
    chosen = under.find((w) => w.focused);
    if (!chosen && under.length) {
      const last = await chrome.windows
        .getLastFocused()
        .then((w) => w.id)
        .catch(() => undefined);
      chosen = under.find((w) => w.id === last) ?? under[0];
    }
  } else {
    const last = await chrome.windows.getLastFocused().catch(() => undefined);
    chosen = windows.find((w) => w.id === last?.id) ?? windows[0];
  }
  const tab = chosen?.tabs?.find((t) => t.active);
  if (!chosen || !tab || tab.id === undefined || tab.windowId === undefined)
    return undefined;
  return {
    tab: { ...tab, id: tab.id, windowId: tab.windowId, url: tab.url ?? "" },
    window: chosen,
  };
}

/**
 * The viewport's top-left corner and scale in screen DIP: the window's bounds
 * minus the browser chrome, which is whatever the zoomed viewport does not fill.
 */
export function viewportFrame(
  window: chrome.windows.Window,
  metrics: {
    innerWidth: number;
    innerHeight: number;
    devicePixelRatio: number;
  },
  zoom: number,
) {
  const width = window.width ?? 0;
  const height = window.height ?? 0;
  const side = Math.max(0, (width - metrics.innerWidth * zoom) / 2);
  const top = Math.max(0, height - metrics.innerHeight * zoom - side);
  return {
    screenX: (window.left ?? 0) + side,
    screenY: (window.top ?? 0) + top,
    devicePixelRatio: metrics.devicePixelRatio,
    zoom,
  };
}
