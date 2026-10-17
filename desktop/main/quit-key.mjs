import { HotkeyRegistry } from "../capture/hotkey.mjs";
import { armHardQuitDeadline, armQuitWatchdog } from "./quit.mjs";

/** Control, Option and Command on a Mac, Control, Alt and Shift elsewhere: a
 * chord nobody presses by accident and no system shortcut owns. */
export const DEFAULT_QUIT_KEY = Object.freeze({
  darwin: "Control+Alt+Command+B",
  win32: "Control+Alt+Shift+B",
  linux: "Control+Alt+Shift+B",
});

/** How long a clean quit may take before the process is ended outright. */
export const QUIT_GRACE = 1000;

/** The global shortcut that ends Blink even when its windows are hung. It
 * lives in the main process, so no renderer has to answer. The linked
 * terminal sessions are told first, then a normal quit starts, and if that is
 * not finished after `grace` the process exits itself.
 *
 * shortcuts: {register, unregister}; store: {read, write}; quit(): the normal
 * quit; exit(): the hard exit; announce(): tells linked sessions. */
export function createQuitKey({
  shortcuts,
  platform = process.platform,
  store,
  quit,
  exit,
  announce = async () => {},
  reserved = () => [],
  grace = QUIT_GRACE,
  watchdog = armQuitWatchdog,
  backstop = armHardQuitDeadline,
  onQuit = () => {},
}) {
  let quitting = false;
  const registry = new HotkeyRegistry({
    shortcuts,
    platform,
    defaults: DEFAULT_QUIT_KEY,
    reserved,
    run: () => trigger(),
  });
  function trigger() {
    if (quitting) return;
    quitting = true;
    onQuit();
    watchdog(exit, grace);
    // The same deadline on a worker thread covers a main thread stuck inside
    // a native call, where no timer runs.
    backstop(grace + 500);
    // The notice may not hold the quit back: it is sent, not awaited.
    void Promise.resolve()
      .then(announce)
      .catch(() => {});
    quit();
  }
  return {
    trigger,
    async start() {
      registry.initial = (await store.read()) ?? DEFAULT_QUIT_KEY[platform];
      return registry.start();
    },
    get current() {
      return registry.current;
    },
    async set(accelerator) {
      const result = registry.set(accelerator);
      if (result.ok) await store.write(accelerator);
      return result;
    },
    dispose: () => registry.dispose(),
  };
}
