import { BrowserWindow, ipcMain, shell, app, screen } from "electron";
import { fileURLToPath } from "node:url";
import { aborted, deadline, fadeWindow } from "./core.mjs";
import { validateChoice } from "./choice.mjs";
import { permissionLabels } from "./permission.mjs";
import { captureText, textTable } from "./strings.mjs";
import { pickLocale } from "../shared/i18n.mjs";
import { setLayer, escape } from "../shared/escape.mjs";

export const systemLanguages = () => [
  ...app.getPreferredSystemLanguages(),
  app.getLocale(),
];
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
  ipcMain.handle("blinkling:capture-ui:init", (e) => {
    const entry = trusted(e);
    entry.attached?.();
    return entry.initial();
  });
  ipcMain.handle("blinkling:capture-ui:ready", (e) => {
    const entry = trusted(e);
    if (entry.kind !== "overlay") throw Error("Invalid capture action");
    entry.ready?.();
  });
  ipcMain.handle("blinkling:capture-ui:finish", (e, choice) => {
    const entry = trusted(e);
    if (entry.kind !== "overlay" || !entry.session)
      throw Error("Invalid capture action");
    entry.session.finish(validateChoice(choice, entry.session));
  });
  ipcMain.handle("blinkling:capture-ui:cancel", (e) => {
    const entry = trusted(e);
    if (entry.kind === "permission") return entry.cancel();
    // Esc closes only the topmost layer; the overlay is the top one while open.
    if (escape() === null) entry.session?.finish(null);
  });
  ipcMain.handle("blinkling:capture-ui:settings", (e) => {
    if (trusted(e).kind !== "permission") throw Error("Invalid capture action");
    return shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    );
  });
}
export const captureWindows = () =>
  [...registry.values()].map((entry) => entry.win);

const page = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));
const secureWindow = (options) =>
  new BrowserWindow({
    ...options,
    useContentSize: true,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
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
function lock(win) {
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin")
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

/** The pointer in the overlay's own coordinates, so the window under it is
 * highlighted on open instead of after the first move. */
function cursorOn(bounds) {
  let point = screen.getCursorScreenPoint();
  if (process.platform !== "darwin")
    try {
      point = screen.screenToDipPoint(point);
    } catch {
      // Already in DIPs on this platform.
    }
  return { x: point.x - bounds.x, y: point.y - bounds.y };
}

/** One hidden, transparent overlay per display, created at start and reused for
 * every capture (N7.4). Opening sends the frozen frame to the page, shows the
 * window and fades the page in; closing fades out and hides. The window is
 * never created, destroyed or made opaque while a capture runs, so no frame
 * ever shows anything but the screen. */
export class CaptureOverlays {
  #entries = new Map();
  #sync = () => this.#reconcile();
  constructor({ displays = () => screen.getAllDisplays() } = {}) {
    this.displays = displays;
  }
  /** Resolves once every overlay has loaded its page. */
  async start() {
    installHandlers();
    screen.on("display-added", this.#sync);
    screen.on("display-removed", this.#sync);
    screen.on("display-metrics-changed", this.#sync);
    await this.#reconcile();
  }
  get windows() {
    return [...this.#entries.values()].map((entry) => entry.win);
  }
  #reconcile() {
    const wanted = new Map(this.displays().map((d) => [String(d.id), d]));
    for (const [id, entry] of this.#entries)
      if (!wanted.has(id)) {
        this.#entries.delete(id);
        entry.session?.finish(null);
        if (!entry.win.isDestroyed()) entry.win.destroy();
      }
    const created = [];
    for (const [id, display] of wanted) {
      const entry = this.#entries.get(id);
      if (entry && !entry.win.isDestroyed()) {
        if (!entry.session) entry.win.setBounds(display.bounds);
      } else created.push(this.#create(id, display));
    }
    return Promise.all(created);
  }
  #create(id, display) {
    const win = secureWindow({ ...display.bounds, focusable: true });
    lock(win);
    const entry = {
      kind: "overlay",
      win,
      session: null,
      ready: null,
      initial: () => {
        const locale = pickLocale(systemLanguages());
        return { locale, text: textTable(locale) };
      },
    };
    entry.loaded = (async () => {
      registry.set(win.webContents.id, entry);
      const key = win.webContents.id;
      win.once("closed", () => {
        registry.delete(key);
        if (this.#entries.get(id) === entry) this.#entries.delete(id);
        entry.session?.finish(null);
      });
      const attached = new Promise((resolve) => {
        entry.attached = resolve;
      });
      await win.loadFile(page("selection.html"));
      await attached;
      // Start at opacity 0 so the first open fades in like every later one.
      await fadeWindow(win, 0);
    })();
    this.#entries.set(id, entry);
    return entry.loaded;
  }
  /** Shows the overlay on one display. Resolves with the validated choice, or
   * null when cancelled; rejects with the abort reason when aborted. */
  async open(displayId, { capture, windows, companion }, signal) {
    aborted(signal);
    let entry = this.#entries.get(String(displayId));
    if (!entry || entry.win.isDestroyed()) {
      await this.#reconcile();
      entry = this.#entries.get(String(displayId));
    }
    if (!entry) throw Error("Display no longer available");
    await entry.loaded;
    aborted(signal);
    const { win } = entry;
    let finish;
    const result = new Promise((resolve) => {
      finish = resolve;
    });
    entry.session = { capture, windows, companion, finish };
    const abort = () => finish(null);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const ready = new Promise((resolve) => {
        entry.ready = resolve;
      });
      win.webContents.send("blinkling:capture-ui:open", {
        image: capture.image,
        windows,
        companion,
        cursor: cursorOn(win.getBounds()),
        width: capture.region.width,
        height: capture.region.height,
      });
      await deadline(ready, 5000, "CAPTURE_UNAVAILABLE", "Overlay not ready");
      if (!signal?.aborted) {
        win.show();
        win.focus();
        setLayer("overlay", () => finish(null));
        void fadeWindow(win, 1).catch(() => {});
      }
      const choice = await result;
      aborted(signal);
      return choice;
    } finally {
      signal?.removeEventListener("abort", abort);
      setLayer("overlay", null);
      entry.ready = null;
      entry.session = null;
      if (!win.isDestroyed()) {
        await fadeWindow(win, 0).catch(() => {});
        if (!win.isDestroyed()) win.hide();
      }
    }
  }
  dispose() {
    screen.removeListener("display-added", this.#sync);
    screen.removeListener("display-removed", this.#sync);
    screen.removeListener("display-metrics-changed", this.#sync);
    for (const entry of this.#entries.values()) {
      entry.session?.finish(null);
      if (!entry.win.isDestroyed()) entry.win.destroy();
    }
    this.#entries.clear();
  }
}

export async function createPermissionWindow(
  display,
  signal,
  onCancel = () => {},
) {
  aborted(signal);
  installHandlers();
  const width = Math.min(520, display.workArea.width),
    height = Math.min(420, display.workArea.height);
  const win = secureWindow({
    width,
    height,
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    focusable: true,
  });
  lock(win);
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
      onCancel();
    }
  };
  const locale = pickLocale(systemLanguages());
  registry.set(win.webContents.id, {
    kind: "permission",
    win,
    cancel: () => finish(null),
    initial: () => ({
      locale,
      text: textTable(locale),
      labels: permissionLabels(process.getSystemVersion(), captureText(locale)),
      appName: app.getName(),
    }),
  });
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
    await win.loadFile(page("permission.html"));
    aborted(signal);
    win.show();
    win.focus();
    return {
      win,
      result,
      close: () => {
        if (!settled) {
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
export const permissionWindow = (display, signal, cancel) =>
  createPermissionWindow(display, signal, cancel);
