/** Pure window logic shared by the main process and the overlay page: which
 * window is under the pointer, which are browsers, where the 整頁 chip sits.
 * Boxes are display-relative DIP, windows are front to back. */
/** A press that moves farther than this is an area drag; less is a click. */
export const DRAG_THRESHOLD = 6;

const finite = (b) =>
  !!b && ["x", "y", "width", "height"].every((k) => Number.isFinite(b[k]));

export function windowAt(windows, point) {
  for (const win of windows ?? []) {
    const b = win?.bounds;
    if (!finite(b) || b.width <= 0 || b.height <= 0) continue;
    if (
      point.x >= b.x &&
      point.x < b.x + b.width &&
      point.y >= b.y &&
      point.y < b.y + b.height
    )
      return win;
  }
  return null;
}

const CHROME_APP =
  /^(google[ -])?chrome(\.exe)?$|^chromium(-browser)?(\.exe)?$/i;
const EDGE_APP = /^(microsoft[ -])?edge(\.exe)?$|^msedge(\.exe)?$/i;
// Edge puts a zero-width space inside its own name in the title.
const clean = (text) =>
  String(text ?? "").replace(/[\u200b-\u200d\ufeff]/g, "");

/** "chrome", "edge" or null. The app name or window class wins; a browser's own
 * title suffix is the fallback where the OS gives no app name. */
export function browserOf(win) {
  if (!win) return null;
  for (const name of [win.appClass, win.app].map(clean)) {
    if (CHROME_APP.test(name)) return "chrome";
    if (EDGE_APP.test(name)) return "edge";
  }
  const title = clean(win.title);
  if (/ - Google Chrome$/.test(title)) return "chrome";
  if (/ - Microsoft Edge$/.test(title)) return "edge";
  return null;
}

/** Top-left of the chip: inside the window's top right, kept on the display. */
export function chipAnchor(window, display, size, inset = 12) {
  const left = Math.max(window.x, display.x);
  const top = Math.max(window.y, display.y);
  const right = Math.min(window.x + window.width, display.x + display.width);
  const bottom = Math.min(window.y + window.height, display.y + display.height);
  const onDisplay = (value, origin, extent, length) =>
    Math.max(origin, Math.min(value, origin + extent - length));
  return {
    x: onDisplay(
      Math.max(left, right - inset - size.width),
      display.x,
      display.width,
      size.width,
    ),
    y: onDisplay(
      Math.min(top + inset, bottom - size.height),
      display.y,
      display.height,
      size.height,
    ),
  };
}
