import { BrowserWindow, ipcMain, shell, app } from "electron";
import { fileURLToPath } from "node:url";
import { cropGeometry, aborted } from "./core.mjs";
import { permissionLabels } from "./permission.mjs";
const registry = new Map();
let installed = false;
function installHandlers() {
  if (installed) return;
  installed = true;
  const trusted = (event) => {
    const entry = registry.get(event.sender.id);
    if (!entry || event.senderFrame !== event.sender.mainFrame)
      throw Error("Untrusted capture UI");
    return entry;
  };
  ipcMain.handle("blinkling:capture-ui:init", (e) => trusted(e).initial);
  ipcMain.handle("blinkling:capture-ui:finish", (e, rect) => {
    const entry = trusted(e);
    if (entry.kind !== "region") throw Error("Invalid capture action");
    cropGeometry(rect, entry.initial);
    entry.resolve(rect);
  });
  ipcMain.handle("blinkling:capture-ui:cancel", (e) =>
    trusted(e).resolve(null),
  );
  ipcMain.handle("blinkling:capture-ui:settings", (e) => {
    if (trusted(e).kind !== "permission") throw Error("Invalid capture action");
    return shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    );
  });
}
export const captureWindows = () =>
  [...registry.values()].map((entry) => entry.win);
export async function createCaptureWindow(
  kind,
  display,
  initial,
  signal,
  onCancel = () => {},
) {
  aborted(signal);
  installHandlers();
  const permission = kind === "permission";
  const width = Math.min(520, display.workArea.width),
    height = Math.min(360, display.workArea.height);
  const win = new BrowserWindow({
    ...(permission
      ? {
          width,
          height,
          x: Math.round(
            display.workArea.x + (display.workArea.width - width) / 2,
          ),
          y: Math.round(
            display.workArea.y + (display.workArea.height - height) / 2,
          ),
        }
      : display.bounds),
    useContentSize: true,
    transparent: permission,
    fullscreen: !permission && process.platform !== "darwin",
    backgroundColor: permission ? "#00000000" : "#0c0e0d",
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: true,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin")
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  let settled = false,
    resolve,
    reject;
  const result = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  // Attach a handler immediately: abort may arrive while loadFile is awaiting.
  result.catch(() => {});
  const finish = (value) => {
    if (!settled) {
      settled = true;
      resolve(value);
      if (permission) onCancel();
    }
  };
  registry.set(win.webContents.id, { kind, initial, win, resolve: finish });
  const id = win.webContents.id;
  const abort = () => {
    if (!settled) {
      settled = true;
      reject(signal.reason);
    }
    if (!win.isDestroyed()) win.close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  win.once("closed", () => {
    registry.delete(id);
    signal?.removeEventListener("abort", abort);
    if (!settled) finish(null);
  });
  try {
    await win.loadFile(
      fileURLToPath(
        new URL(
          permission ? "./permission.html" : "./selection.html",
          import.meta.url,
        ),
      ),
    );
    aborted(signal);
    win.show();
    if (!permission && process.platform === "darwin")
      win.setSimpleFullScreen(true);
    win.focus();
    return {
      win,
      result,
      close: () => {
        if (permission && !settled) {
          settled = true;
          resolve(null);
        }
        if (!win.isDestroyed()) win.close();
      },
    };
  } catch (error) {
    if (!win.isDestroyed()) win.close();
    throw error;
  }
}
export function permissionWindow(display, signal, cancel) {
  return createCaptureWindow(
    "permission",
    display,
    {
      labels: permissionLabels(process.getSystemVersion()),
      appName: app.getName(),
    },
    signal,
    cancel,
  );
}
export async function selectRegion(capture, signal) {
  const view = await createCaptureWindow(
    "region",
    capture.display,
    capture,
    signal,
  );
  try {
    return await view.result;
  } finally {
    view.close();
  }
}
