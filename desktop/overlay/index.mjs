import { BrowserWindow } from "electron";
export async function createOverlay(display, drawings) {
  const rects = drawings
    .map(({ rect: r }) => {
      if (
        !["x", "y", "width", "height"].every((k) => Number.isFinite(r[k])) ||
        r.width < 0 ||
        r.height < 0
      )
        throw new Error("Invalid drawing");
      return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#3ddc97" stroke-width="4"/>`;
    })
    .join("");
  const win = new BrowserWindow({
    ...display.bounds,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin")
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  await win.loadURL(
    `data:text/html,${encodeURIComponent(`<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"></head><body style="margin:0;background:transparent"><svg width="${display.bounds.width}" height="${display.bounds.height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg></body></html>`)}`,
  );
  win.setIgnoreMouseEvents(true, { forward: true });
  win.showInactive();
  return win;
}
