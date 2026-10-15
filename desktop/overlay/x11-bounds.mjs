import { timing } from "../shared/motion.mjs";
import x11 from "x11";
/** Chromium constrains override-redirect windows to one pixel below a display
 * at 100%. Configure the existing XID directly, as the shell already does for
 * stacking. This makes no focus request and changes only our own window. */
export function exactX11Bounds(win, bounds, displayId) {
  if (process.platform !== "linux" || !process.env.DISPLAY)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const client = x11.createClient((error, display) => {
      if (error) {
        finish(error);
        return;
      }
      const configure = (nativeBounds) => {
        const id = win.getNativeWindowHandle().readUInt32LE(0);
        client.ConfigureWindow(id, nativeBounds);
        client.GetGeometry(id, (error, geometry) => {
          if (error) return finish(error);
          if (
            geometry.xPos !== nativeBounds.x ||
            geometry.yPos !== nativeBounds.y ||
            geometry.width !== nativeBounds.width ||
            geometry.height !== nativeBounds.height
          )
            finish(Error("Native guide viewport differs from the display"));
          else finish();
        });
      };
      // Fractional DIP rounding loses up to two pixels on later monitors.
      // Electron's X11 display ID is the RandR output ID; query its actual
      // CRTC rather than reconstructing native bounds from rounded DIPs.
      client.require("randr", (error, randr) => {
        if (error) return configure(bounds);
        randr.GetScreenResources(display.screen[0].root, (error, resources) => {
          if (error) return finish(error);
          const output = Number(displayId);
          // Single-display Xvfb reports a synthetic Electron ID of zero.
          if (!resources.outputs.includes(output)) return configure(bounds);
          randr.GetOutputInfo(
            output,
            resources.config_timestamp,
            (error, info) => {
              if (error) return finish(error);
              if (!info.crtc)
                return finish(Error("Guide display is disconnected"));
              randr.GetCrtcInfo(
                info.crtc,
                resources.config_timestamp,
                (error, crtc) => {
                  if (error) return finish(error);
                  if (!crtc.width || !crtc.height)
                    return finish(
                      Error("Guide display has no native viewport"),
                    );
                  configure({
                    x: crtc.x,
                    y: crtc.y,
                    width: crtc.width,
                    height: crtc.height,
                  });
                },
              );
            },
          );
        });
      });
    });
    const timer = setTimeout(
      () => finish(Error("Native guide resize timed out")),
      timing.guideResize,
    );
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.terminate();
      if (error) reject(error);
      else resolve();
    };
    client.on("error", finish);
  });
}
