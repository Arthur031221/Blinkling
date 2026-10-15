// The locator's view of the screen, built from what the shell already has:
// the per-display window lists, the display list and a screen grab. Kept apart
// from Electron so it can be tested with fakes.
import { displayAt } from "./snap.mjs";

const centre = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const overlaps = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const union = (a, b) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** createCaptureAccess({ screen, windowsOn, grab }) -> CaptureAccess
 *  screen.getAllDisplays() -> Electron displays
 *  windowsOn(display) -> windows on that display, display-relative DIP
 *  grab(display) -> nativeImage of the whole display */
export function createCaptureAccess({ screen, windowsOn, grab }) {
  const displays = () =>
    screen.getAllDisplays().map((d) => ({
      id: String(d.id),
      scaleFactor: d.scaleFactor || 1,
      bounds: { ...d.bounds },
    }));

  return {
    displays,

    // Front to back. Each display lists its own windows clipped to it; a window
    // that spans displays is joined back into one box.
    async windows() {
      const lists = await Promise.all(
        screen.getAllDisplays().map(async (display) => {
          try {
            return (await windowsOn(display)).map((win) => ({
              ...win,
              bounds: {
                x: win.bounds.x + display.bounds.x,
                y: win.bounds.y + display.bounds.y,
                width: win.bounds.width,
                height: win.bounds.height,
              },
            }));
          } catch {
            return [];
          }
        }),
      );
      const merged = new Map();
      for (const win of lists.flat()) {
        const seen = merged.get(win.id);
        if (seen) seen.bounds = union(seen.bounds, win.bounds);
        else merged.set(win.id, { ...win });
      }
      return [...merged.values()].map((win) => ({
        id: String(win.id),
        title: win.title ?? "",
        app: win.app ?? "",
        pid: win.pid,
        bounds: win.bounds,
        private: false,
        passwordManager: false,
      }));
    },

    // Pixels of a region in screen DIP, from the display holding its centre.
    async image(rect) {
      const list = screen.getAllDisplays();
      const home = displayAt(displays(), centre(rect));
      const display = list.find((d) => String(d.id) === home?.id);
      if (!display || !overlaps(rect, display.bounds)) return null;
      const full = await grab(display);
      const size = full.getSize();
      const scale = size.width / display.bounds.width || 1;
      const part = full.crop({
        x: Math.max(0, Math.round((rect.x - display.bounds.x) * scale)),
        y: Math.max(0, Math.round((rect.y - display.bounds.y) * scale)),
        width: Math.min(size.width, Math.round(rect.width * scale)),
        height: Math.min(size.height, Math.round(rect.height * scale)),
      });
      const out = part.getSize();
      return {
        width: out.width,
        height: out.height,
        data: part.toBitmap(),
        scale,
      };
    },
  };
}
