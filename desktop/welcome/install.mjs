import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createWelcomeController, WELCOME_SIZE } from "./index.mjs";
import { createOnce, fileStore } from "../pick/once.mjs";
import { pickLocale } from "../shared/i18n.mjs";

const file = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

/** Makes the welcome window (hidden, reused) and its controller. The shell opens
 * it on the first start and from Settings.
 *
 * electron: {BrowserWindow, ipcMain, systemPreferences, desktopCapturer}
 * shell: {userDataDir, locales, windowOptions(bounds, focusable), secure(win),
 *   workArea(), input, openExternal(url), env?, platform?}
 * pickKey: {get()} */
export function installWelcome({
  electron,
  shell,
  pickKey,
  onError = () => {},
}) {
  const { BrowserWindow, ipcMain, systemPreferences, desktopCapturer } =
    electron;
  const env = shell.env ?? process.env;
  // Read on each use: a language chosen in settings applies at once.
  const locale = () =>
    pickLocale(
      [env.BLINKLING_LOCALE, ...(shell.locales ?? [])].filter(Boolean),
    );
  const win = new BrowserWindow({
    ...shell.windowOptions({ x: 0, y: 0, ...WELCOME_SIZE }, true),
    webPreferences: {
      ...shell.windowOptions({}, true).webPreferences,
      preload: file("preload.cjs"),
    },
  });
  shell.secure(win);
  const loaded = win.loadFile(file("index.html")).catch(onError);

  const once = createOnce(
    fileStore(join(shell.userDataDir, "welcome-once.json")),
  );
  const controller = createWelcomeController({
    win,
    loaded,
    onChange: (open) => shell.windowOpen?.(open),
    ipc: ipcMain,
    locale,
    platform: shell.platform ?? process.platform,
    pickKey,
    permission: {
      status: () => systemPreferences.getMediaAccessStatus("screen"),
      // Asking for a source is what makes macOS list the app under Screen Recording.
      request: async () => {
        await desktopCapturer
          .getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 },
          })
          .catch(onError);
      },
      open: () =>
        shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        ),
    },
    once,
    focus: {
      remember: async () => {
        await shell.input?.rememberFocus();
      },
      activate: (target) => shell.input?.activate(target),
      restore: () => shell.input?.restoreFocus(),
    },
    workArea: shell.workArea,
    avoid: shell.avoid,
    nudges: shell.nudges,
  });
  return {
    open: () => controller.open(),
    openFirstTime: () => controller.openFirstTime(),
    close: () => controller.close(),
    test: { controller, win },
    dispose() {
      controller.dispose();
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
