import { timing } from "../shared/motion.mjs";
import x11 from "x11";
/** Bottom to top. The chat card sits under the Blink surface so it can never
 * cover a menu pill, and the guides stay beneath both. */
/**
 * Raising a window that can take the keyboard hands it the keyboard on some
 * window managers, taking it from the app the reader just clicked. Such a
 * window is raised only when it appears or while it already has the focus.
 */
export function mayRaise(w, appearing = false) {
  return appearing || !w.isFocusable() || w.isFocused();
}
/** The image viewer is modal: while it is up it is the only window kept on
 * top, so the others stay where they were, beneath it. Raising them over it
 * on every poll made the pointer cross between windows without end. */
export function stackOrder({ overlay, guides, card, blink, viewer }) {
  if (viewer) return [viewer];
  return [overlay, guides, card, blink].filter(Boolean);
}
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
      // Raising a window that can take the keyboard hands it the keyboard on
      // some window managers, taking it from the app the reader just clicked.
      // Such a window is raised only when it appears; the rest are raised always.
      const raise = (appearing = false) => {
        if (closed) return;
        for (const w of live())
          if (mayRaise(w, appearing)) client.RaiseWindow(id(w));
      };
      client.ChangeWindowAttributes(display.screen[0].root, {
        eventMask: x11.eventMask.SubstructureNotify,
      });
      client.on("event", (event) => {
        // Our own windows mapping (the card appearing) must restack too; their
        // own ConfigureNotify must not, or raising would feed itself.
        const own = live().some((w) => id(w) === (event.wid1 ?? event.wid));
        if (event.name === "MapNotify") raise(own);
        else if (event.name === "ConfigureNotify" && !own) raise();
      });
      // Catch compositor restacks that do not produce a root child event.
      const timer = setInterval(() => raise(), timing.stackingPoll);
      raise(true);
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
