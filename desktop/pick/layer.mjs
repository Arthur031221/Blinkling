/** One transparent layer window per display, created hidden at start and
 * reused for every pick (M2). Main-process side: placement, show/hide, the
 * message hop to the renderer and pointer events back in global DIP. */
import { fileURLToPath } from "node:url";
import { MAX_EFFECT_MS } from "./effects.mjs";
import { FLIGHT_MS } from "./flight.mjs";

const BLANK_TIMEOUT = 500;
const here = (name) => fileURLToPath(new URL(name, import.meta.url));

export function createLayers({ electron, onPointer = () => {}, raise }) {
  const { BrowserWindow, screen, ipcMain } = electron;
  const layers = new Map(); // display id -> { win, display }
  let shown = false;
  let playing = null;

  const owner = (event) =>
    [...layers.values()].find((l) => l.win.webContents.id === event.sender.id);

  const originOf = (layer) => {
    const b = layer.win.getBounds();
    return { x: b.x, y: b.y };
  };

  function place(layer) {
    const { bounds } = layer.display;
    layer.win.setBounds(bounds);
  }

  async function create(display) {
    const win = new BrowserWindow({
      ...display.bounds,
      show: false,
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      fullscreenable: false,
      enableLargerThanScreen: true,
      alwaysOnTop: true,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: here("./layer-preload.cjs"),
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
    const layer = { win, display };
    layers.set(display.id, layer);
    await win.loadFile(here("./layer.html"));
    if (shown && !win.isDestroyed()) win.showInactive();
    return layer;
  }

  const onPointerEvent = (event, message) => {
    const layer = owner(event);
    if (!layer || !message || !["move", "down", "up"].includes(message.type)) return;
    const o = originOf(layer);
    onPointer({ type: message.type, x: o.x + Number(message.x), y: o.y + Number(message.y) });
  };
  const onLandedEvent = (event) => {
    const layer = owner(event);
    if (layer) playing?.check(layer.display.id);
  };
  ipcMain.on("blinkling:pick:pointer", onPointerEvent);
  ipcMain.on("blinkling:pick:landed", onLandedEvent);
  let blanking = null;
  const onBlankedEvent = (event) => {
    const layer = owner(event);
    if (layer) blanking?.check(layer.display.id);
  };
  ipcMain.on("blinkling:pick:blanked", onBlankedEvent);

  const sync = () => {
    const displays = screen.getAllDisplays();
    for (const [id, layer] of layers)
      if (!displays.some((d) => d.id === id)) {
        layers.delete(id);
        if (!layer.win.isDestroyed()) layer.win.destroy();
      }
    for (const d of displays) {
      const layer = layers.get(d.id);
      if (layer) {
        layer.display = d;
        place(layer);
      } else void create(d);
    }
  };
  screen.on("display-added", sync);
  screen.on("display-removed", sync);
  screen.on("display-metrics-changed", sync);

  const live = () => [...layers.values()].filter((l) => !l.win.isDestroyed());
  const send = (channel, message) => {
    for (const layer of live())
      layer.win.webContents.send(channel, { ...message, origin: originOf(layer) });
  };

  const ready = Promise.all(screen.getAllDisplays().map(create));

  return {
    ready,
    windows: () => live().map((l) => l.win),
    get shown() {
      return shown;
    },
    show() {
      shown = true;
      for (const l of live()) if (!l.win.isVisible()) l.win.showInactive();
      raise?.(live().map((l) => l.win));
    },
    hide() {
      shown = false;
      for (const l of live()) l.win.hide();
    },
    state(state) {
      send("blinkling:pick:state", state);
    },
    /** Draw the effect and the flight; resolves once every layer has landed it. */
    play(message) {
      playing?.settle();
      const waiting = new Set(live().map((l) => l.display.id));
      let settle;
      const done = new Promise((resolve) => {
        settle = resolve;
      });
      // A layer that never answers must not hold a pick forever.
      setTimeout(settle, (MAX_EFFECT_MS + FLIGHT_MS) * 2).unref?.();
      const check = (id) => {
        waiting.delete(id);
        if (!waiting.size) settle();
      };
      playing = { settle, check };
      send("blinkling:pick:play", message);
      return done;
    },
    /** Blank or restore every layer's drawing; resolves once each has painted it. */
    blank(on) {
      const waiting = new Set(live().map((l) => l.display.id));
      if (!waiting.size) return Promise.resolve();
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, BLANK_TIMEOUT);
        timer.unref?.();
        blanking = {
          check(id) {
            waiting.delete(id);
            if (!waiting.size) {
              clearTimeout(timer);
              resolve();
            }
          },
        };
        send("blinkling:pick:blank", { on });
      });
    },
    frames: () =>
      Promise.all(
        live().map((l) =>
          l.win.webContents.executeJavaScript("globalThis.__blinklingFrames ?? []"),
        ),
      ).then((all) => all.flat()),
    dispose() {
      ipcMain.removeListener("blinkling:pick:pointer", onPointerEvent);
      ipcMain.removeListener("blinkling:pick:landed", onLandedEvent);
      ipcMain.removeListener("blinkling:pick:blanked", onBlankedEvent);
      screen.removeListener("display-added", sync);
      screen.removeListener("display-removed", sync);
      screen.removeListener("display-metrics-changed", sync);
      for (const l of live()) l.win.destroy();
      layers.clear();
    },
  };
}
