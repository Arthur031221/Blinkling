import { fileURLToPath } from "node:url";
import { createViewerController } from "./index.mjs";

const file = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

/** Makes the viewer window (hidden, reused) and its controller.
 *
 * electron: {BrowserWindow, ipcMain}
 * shell: {windowOptions(bounds, focusable), secure(win), bounds(), input,
 *   viewing(open)} */
export function installViewer({ electron, shell, onError = () => {} }) {
  const { BrowserWindow, ipcMain } = electron;
  const win = new BrowserWindow({
    ...shell.windowOptions({ x: 0, y: 0, width: 800, height: 600 }, true),
    webPreferences: {
      ...shell.windowOptions({}, true).webPreferences,
      preload: file("preload.cjs"),
    },
  });
  shell.secure(win);
  const loaded = win.loadFile(file("index.html")).catch(onError);
  const controller = createViewerController({
    win,
    loaded,
    ipc: ipcMain,
    bounds: shell.bounds,
    onChange: (open) => shell.viewing?.(open),
    focus: {
      remember: async () => {
        await shell.input?.rememberFocus();
      },
      activate: (target) => shell.input?.activate(target),
      restore: () => shell.input?.restoreFocus(),
    },
  });
  return {
    open: (image) => controller.open(image),
    close: () => controller.close(),
    isOpen: () => controller.isOpen(),
    test: { controller, win },
    dispose() {
      controller.dispose();
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
