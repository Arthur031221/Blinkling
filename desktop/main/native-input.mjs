import x11 from "x11";
/** X11 input-only shape: transparent pixels do not intercept clicks, and the
 * compositor still receives the uncut alpha antialiasing of the SVG. */
export async function nativeInput() {
  if (process.platform !== "linux" || !process.env.DISPLAY) return null;
  return new Promise((resolve, reject) => {
    const client = x11.createClient((error, display) => {
      if (error) {
        reject(error);
        return;
      }
      client.require("shape", (error, shape) => {
        if (error) {
          client.terminate();
          reject(error);
          return;
        }
        let previous = null;
        const root = display.screen[0].root;
        client.InternAtom(false, "_NET_ACTIVE_WINDOW", (error, active) => {
          if (error) {
            client.terminate();
            reject(error);
            return;
          }
          // Keep the WM's active client in sync with Electron's direct focus call.
          // Otherwise a later native click can reach an app without focusing it.
          function activate(id) {
            const event = Buffer.alloc(32);
            event[0] = 33;
            event[1] = 32;
            event.writeUInt32LE(id, 4);
            event.writeUInt32LE(active, 8);
            event.writeUInt32LE(2, 12);
            client.SendEvent(
              root,
              false,
              x11.eventMask.SubstructureRedirect |
                x11.eventMask.SubstructureNotify,
              event,
            );
          }
          resolve({
            activate: (win) =>
              activate(win.getNativeWindowHandle().readUInt32LE()),
            setRegions(win, regions, scale = 1, managedFrame = false) {
              const id = win.getNativeWindowHandle().readUInt32LE();
              const rectangles = regions.map((r) => [
                Math.round(r.x * scale),
                Math.round(r.y * scale),
                Math.max(1, Math.ceil(r.width * scale)),
                Math.max(1, Math.ceil(r.height * scale)),
              ]);
              shape.Rectangles(
                shape.Op.Set,
                shape.Kind.Input,
                id,
                0,
                0,
                rectangles,
              );
              // A managed client's transparent holes also need to exclude the
              // WM frame, whose passive click grab would otherwise activate it.
              if (managedFrame)
                client.QueryTree(id, (error, tree) => {
                  if (error || win.isDestroyed() || tree.parent === root)
                    return;
                  client.TranslateCoordinates(
                    id,
                    tree.parent,
                    0,
                    0,
                    (error, offset) => {
                      if (error || win.isDestroyed()) return;
                      shape.Rectangles(
                        shape.Op.Set,
                        shape.Kind.Input,
                        tree.parent,
                        offset.destX,
                        offset.destY,
                        rectangles,
                      );
                    },
                  );
                });
            },
            rememberFocus: () =>
              new Promise((resolve) =>
                client.GetProperty(
                  false,
                  root,
                  active,
                  0,
                  0,
                  1,
                  (error, result) => {
                    if (!error && result.data.length >= 4) {
                      previous = result.data.readUInt32LE();
                      resolve();
                    } else
                      client.GetInputFocus((error, result) => {
                        previous = error ? null : result.focus;
                        resolve();
                      });
                  },
                ),
              ),
            restoreFocus() {
              if (previous && previous > 1) {
                client.SetInputFocus(previous, 1, 0);
                activate(previous);
              }
              previous = null;
            },
            dispose() {
              client.terminate();
            },
          });
        });
      });
    });
    client.on("error", (error) => {
      if (error.error !== 3) reject(error);
    });
  });
}
