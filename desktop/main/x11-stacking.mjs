import x11 from "x11";
/** Non-focusable Linux windows are override-redirect. Electron's moveTop uses
 * the WM path, which cannot raise them above a later mapped managed window.
 * Raise their native XIDs directly, without any focus or activation request.
 */
export async function keepAbove(windows) {
  if (process.platform !== "linux" || !process.env.DISPLAY) return () => {};
  return new Promise((resolve, reject) => {
    const client = x11.createClient((error, display) => {
      if (error) {
        reject(error);
        return;
      }
      let closed = false;
      const live = () =>
        windows().filter((w) => !w.isDestroyed() && w.isVisible());
      const id = (w) => w.getNativeWindowHandle().readUInt32LE(0);
      const raise = () => {
        if (!closed) live().forEach((w) => client.RaiseWindow(id(w)));
      };
      client.ChangeWindowAttributes(display.screen[0].root, {
        eventMask: x11.eventMask.SubstructureNotify,
      });
      client.on("event", (event) => {
        if (
          (event.name === "MapNotify" || event.name === "ConfigureNotify") &&
          !live().some((w) => id(w) === (event.wid1 ?? event.wid))
        )
          raise();
      });
      // Catch compositor restacks that do not produce a root child event.
      const timer = setInterval(raise, 250);
      raise();
      resolve(() => {
        closed = true;
        clearInterval(timer);
        client.terminate();
      });
    });
    client.on("error", (error) => {
      reject(error);
    });
  });
}
