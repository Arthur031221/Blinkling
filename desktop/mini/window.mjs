/** The mini composer's window: one hidden, reused BrowserWindow near Blink.
 * It takes the keyboard only while it is open (M6) and sits by Blink's side.
 * Main-process side of the model in model.mjs. */
import { fileURLToPath } from "node:url";
import { miniText } from "./strings.mjs";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const GAP = 12;
const MIN = { width: 360, height: 120 };

export function placeMini(size, blink, workArea) {
  const x = Math.min(
    Math.max(blink.x + blink.width - size.width, workArea.x),
    workArea.x + workArea.width - size.width,
  );
  const above = blink.y - GAP - size.height;
  const y = above >= workArea.y ? above : Math.min(blink.y + blink.height + GAP, workArea.y + workArea.height - size.height);
  return { x: Math.round(x), y: Math.round(y), width: size.width, height: size.height };
}

export function createMiniWindow({ electron, mini, locale, blinkBounds, workAreaFor }) {
  const { BrowserWindow, ipcMain } = electron;
  const text = miniText(locale);
  const strings = { pauseAuto: text("pauseAuto"), inputLabel: text("inputLabel"), remove: text("remove") };
  let size = { ...MIN };
  let opening = false;

  const win = new BrowserWindow({
    ...size,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: here("./preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  const loaded = win.loadFile(here("./index.html"));

  const trusted = (event) => event.sender.id === win.webContents.id;
  const on = (channel, handler) => {
    const wrapped = (event, ...args) => trusted(event) && handler(...args);
    ipcMain.on(channel, wrapped);
    return () => ipcMain.removeListener(channel, wrapped);
  };
  const off = [
    on("blinkling:mini:input", (value) => mini.input(value)),
    on("blinkling:mini:key", (k) => mini.key(k)),
    on("blinkling:mini:chip", (id) => mini.chip(id)),
    on("blinkling:mini:remove", (id) => mini.remove(id)),
    on("blinkling:mini:pause", () => mini.pauseAuto()),
    on("blinkling:mini:offer", (id) => mini.offer(id)),
    on("blinkling:mini:dismiss", (id) => mini.dismissOffer(id)),
    on("blinkling:mini:size", (next) => {
      const width = Math.max(MIN.width, Math.min(520, Number(next?.width) || MIN.width));
      const height = Math.max(MIN.height, Math.min(640, Number(next?.height) || MIN.height));
      if (width === size.width && height === size.height) return;
      size = { width, height };
      if (win.isVisible()) reposition();
    }),
  ];
  const unsubscribe = mini.subscribe((state) => {
    if (win.isDestroyed()) return;
    win.webContents.send("blinkling:mini:state", { ...state, text: strings });
  });

  function reposition() {
    const blink = blinkBounds();
    win.setBounds(placeMini(size, blink, workAreaFor(blink)));
  }

  return {
    win,
    ready: loaded,
    /** Show and take the keyboard: only while it is open. */
    async show() {
      await loaded;
      opening = true;
      reposition();
      win.show();
      win.focus();
      win.webContents.focus();
      opening = false;
    },
    hide() {
      if (!win.isDestroyed() && win.isVisible()) win.hide();
    },
    get opening() {
      return opening;
    },
    dispose() {
      unsubscribe();
      for (const f of off) f();
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
