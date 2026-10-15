import { browserOf } from "../capture/window-hit.mjs";
import { createLocator } from "./index.mjs";

/** Electron hands out BGRA; the image source reads RGBA. */
export function bgraToRgba(bgra) {
  const out = Buffer.from(bgra);
  for (let i = 0; i + 3 < out.length; i += 4) {
    const blue = out[i];
    out[i] = out[i + 2];
    out[i + 2] = blue;
  }
  return out;
}

/** The window's rectangle in its display's pixels, clipped to the display. */
export function cropOf(bounds, display) {
  const scale = display.scaleFactor || 1;
  const left = Math.max(bounds.x, display.bounds.x);
  const top = Math.max(bounds.y, display.bounds.y);
  const right = Math.min(
    bounds.x + bounds.width,
    display.bounds.x + display.bounds.width,
  );
  const bottom = Math.min(
    bounds.y + bounds.height,
    display.bounds.y + display.bounds.height,
  );
  if (right <= left || bottom <= top) return null;
  return {
    x: Math.round((left - display.bounds.x) * scale),
    y: Math.round((top - display.bounds.y) * scale),
    width: Math.round((right - left) * scale),
    height: Math.round((bottom - top) * scale),
  };
}

/** The one locator the desktop shares, over Electron's screen and the native
 * window list. macOS reports points, which are DIP already; elsewhere native
 * pixels go through Electron's screen. */
export function electronLocator({
  electron,
  companion,
  platform = process.platform,
  listWindows,
  screenImage,
  ...rest
}) {
  const { screen, BrowserWindow, nativeImage } = electron;
  const points = platform === "darwin";
  const toDip = points ? (p) => p : (p) => screen.screenToDipPoint(p);
  const toNative = points ? (p) => p : (p) => screen.dipToScreenPoint(p);

  const list = () => {
    const ids = new Set(
      BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed())
        .map((w) => w.getNativeWindowHandle().readUInt32LE(0)),
    );
    return listWindows({ own: { ids, pids: new Set([process.pid]) } });
  };

  /** The window's pixels, cut from its display's capture. The screen is taken
   * as it is, our own windows included: a background read must not hide them. */
  async function capture({ window, display }) {
    if (!screenImage || !nativeImage) return null;
    const source = screen
      .getAllDisplays()
      .find((d) => String(d.id) === display.id);
    const crop = source && cropOf(window.bounds, source);
    if (!crop) return null;
    const image = (await screenImage(source)).crop(crop);
    const size = image.getSize();
    return {
      width: size.width,
      height: size.height,
      data: bgraToRgba(image.toBitmap()),
    };
  }

  return createLocator({
    companion,
    platform,
    capture,
    list,
    displays: () => screen.getAllDisplays(),
    toDip,
    toNative,
    isBrowser: (window) => browserOf(window) !== null,
    ...rest,
  });
}
