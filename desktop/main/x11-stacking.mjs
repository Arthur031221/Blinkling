import { timing } from "../shared/motion.mjs";
import x11 from "x11";
/** Bottom to top. The answer deck sits under the Blink surface so a bubble can
 * never cover a menu pill, and the guides stay beneath both. */
export function stackOrder({ overlay, guides, bubbles, blink }) {
  return [overlay, guides, bubbles, blink].filter(Boolean);
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
      const raise = () => {
        if (!closed) live().forEach((w) => client.RaiseWindow(id(w)));
      };
      client.ChangeWindowAttributes(display.screen[0].root, {
        eventMask: x11.eventMask.SubstructureNotify,
      });
      client.on("event", (event) => {
        // Our own windows mapping (the deck appearing) must restack too; their
        // own ConfigureNotify must not, or raising would feed itself.
        const own = live().some((w) => id(w) === (event.wid1 ?? event.wid));
        if (
          event.name === "MapNotify" ||
          (event.name === "ConfigureNotify" && !own)
        )
          raise();
      });
      // Catch compositor restacks that do not produce a root child event.
      const timer = setInterval(raise, timing.stackingPoll);
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
