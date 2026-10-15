/** A window that cannot take focus is an override-redirect window on X11, which
 * keeps the place it was created in: apps opened later sit above it. The pick
 * layers are made once at start, so each raise puts them back on top. */
import x11 from "x11";

export function createRaiser({ platform = process.platform, display = process.env.DISPLAY, connect = x11.createClient } = {}) {
  if (platform !== "linux" || !display) return { raise() {}, dispose() {} };
  let client = null;
  let ready = false;
  let closed = false;
  const id = (w) => w.getNativeWindowHandle().readUInt32LE(0);
  try {
    client = connect((error) => {
      if (error) client = null;
      else ready = true;
    });
    client?.on?.("error", () => {
      client = null;
    });
  } catch {
    client = null;
  }
  return {
    raise(windows) {
      if (closed || !client || !ready) return;
      for (const w of windows) if (!w.isDestroyed()) client.RaiseWindow(id(w));
    },
    dispose() {
      closed = true;
      client?.terminate?.();
      client = null;
    },
  };
}
