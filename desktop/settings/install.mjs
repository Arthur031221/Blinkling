import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createSettingsController, SETTINGS_SIZE } from "./index.mjs";
import { createSettingsStore } from "./store.mjs";
import { pickLocale } from "../shared/i18n.mjs";

const file = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

/** Makes the settings window (hidden, reused) and its controller. The shell
 * calls this once and opens the window from the Settings bubble.
 *
 * electron: {BrowserWindow, ipcMain}
 * shell: {userDataDir, locales, windowOptions(bounds, focusable), secure(win),
 *   workArea(), input, env?, platform?, version}
 * hotkey: {get(), set(accelerator)}; pickKey: {get(), set(name)};
 * host: {welcome(), guide()} */
export function installSettings({
  electron,
  shell,
  hotkey,
  pickKey,
  host,
  onError = () => {},
}) {
  const { BrowserWindow, ipcMain } = electron;
  const env = shell.env ?? process.env;
  // Read on each use: a language chosen in settings applies at once.
  const locale = () =>
    pickLocale(
      [env.BLINKLING_LOCALE, ...(shell.locales ?? [])].filter(Boolean),
    );
  const win = new BrowserWindow({
    ...shell.windowOptions({ x: 0, y: 0, ...SETTINGS_SIZE }, true),
    webPreferences: {
      ...shell.windowOptions({}, true).webPreferences,
      preload: file("preload.cjs"),
    },
  });
  shell.secure(win);
  const loaded = win.loadFile(file("index.html")).catch(onError);

  const store = createSettingsStore(join(shell.userDataDir, "settings.json"), {
    onError,
  });
  const controller = createSettingsController({
    win,
    loaded,
    ipc: ipcMain,
    locale,
    platform: shell.platform ?? process.platform,
    version: shell.version,
    store,
    hotkey,
    pickKey,
    host,
    focus: {
      remember: async () => {
        await shell.input?.rememberFocus();
      },
      activate: (target) => shell.input?.activate(target),
      restore: () => shell.input?.restoreFocus(),
    },
    workArea: shell.workArea,
    nudges: shell.nudges,
  });
  return {
    open: () => controller.open(),
    close: () => controller.close(),
    store,
    test: { controller, win },
    dispose() {
      controller.dispose();
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
