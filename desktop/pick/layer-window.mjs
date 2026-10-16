import { duration } from "../shared/motion.mjs";

const inside = (b, p) =>
  p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const clamp = (p, b) => ({
  x: Math.min(b.x + b.width - 1, Math.max(b.x, p.x)),
  y: Math.min(b.y + b.height - 1, Math.max(b.y, p.y)),
});
/** A flight that never reports back is cut off after this long. */
const FLIGHT_LIMIT = duration.slow * 4;

/** The pick layer: one transparent, click-through-when-idle window per display,
 * made hidden at start and reused for every pick, so raising it is a show() on a
 * page that is already loaded (M4: within one frame of the threshold).
 *
 * Electron comes in as parameters so the lifecycle is tested with fakes:
 *   BrowserWindow, screen (getAllDisplays, on/removeListener), ipcMain (on),
 *   options (BrowserWindow options shared with the other windows), page (url or
 *   file path to layer.html), secure(win) (the shell's window hardening),
 *   raise(windows) (puts windows back on top of the X stack on Linux). */
export function createLayers({
  BrowserWindow,
  screen,
  ipcMain,
  options,
  page,
  secure = () => {},
  onPointer = () => {},
  raise = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const flying = new Set();
  const layers = new Map(); // display id -> { win, display, ready, queue, active }
  let current = null;
  let token = 0;
  const waiting = new Map(); // token -> resolve

  const send = (layer, channel, value) => {
    if (layer.win.isDestroyed()) return;
    if (!layer.ready) layer.queue.push({ channel, value });
    else
      layer.win.webContents.send("blinkling:pick-message", { channel, value });
  };

  function make(display) {
    const win = new BrowserWindow({
      ...options,
      ...display.bounds,
      focusable: false,
      show: false,
      enableLargerThanScreen: true,
    });
    secure(win);
    const layer = { win, display, ready: false, queue: [], active: false };
    win.setIgnoreMouseEvents(true);
    win.webContents.once("did-finish-load", () => {
      win.webContents.send("blinkling:pick-init", {
        origin: { x: display.bounds.x, y: display.bounds.y },
      });
    });
    layer.load = win.loadFile ? win.loadFile(page) : win.loadURL(page);
    layers.set(String(display.id), layer);
    return layer;
  }

  const byWebContents = (sender) =>
    [...layers.values()].find(
      (l) => !l.win.isDestroyed() && l.win.webContents === sender,
    );

  ipcMain.on("blinkling:pick-ready", (event) => {
    const layer = byWebContents(event.sender);
    if (!layer) return;
    layer.ready = true;
    for (const m of layer.queue.splice(0)) send(layer, m.channel, m.value);
  });
  ipcMain.on("blinkling:pick-pointer", (event, payload) => {
    const layer = byWebContents(event.sender);
    if (
      !layer ||
      !layer.active ||
      !["move", "down", "up"].includes(payload?.type)
    )
      return;
    if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
    onPointer({ type: payload.type, x: payload.x, y: payload.y });
  });
  ipcMain.on("blinkling:pick-flight-done", (event, value) => {
    if (!byWebContents(event.sender)) return;
    waiting.get(value)?.();
  });

  function sync() {
    const displays = screen.getAllDisplays();
    const ids = new Set(displays.map((d) => String(d.id)));
    for (const [id, layer] of layers)
      if (!ids.has(id)) {
        if (!layer.win.isDestroyed()) layer.win.destroy();
        layers.delete(id);
      }
    for (const display of displays) {
      const layer = layers.get(String(display.id));
      if (!layer) make(display);
      else {
        layer.display = display;
        if (!layer.win.isDestroyed()) layer.win.setBounds(display.bounds);
      }
    }
  }
  sync();
  const events = [
    "display-added",
    "display-removed",
    "display-metrics-changed",
  ];
  for (const name of events) screen.on(name, sync);

  const layerFor = (display) => layers.get(String(display.id));

  function raiseWindow(layer, interactive) {
    layer.win.setIgnoreMouseEvents(!interactive);
    layer.active = interactive;
    layer.win.showInactive();
    raise([layer.win]);
  }

  function hideLayer(layer) {
    if (!layer) return;
    send(layer, "clear", {});
    layer.active = false;
    layer.win.setIgnoreMouseEvents(true);
    if (!layer.win.isDestroyed()) layer.win.hide();
  }

  return {
    /** Show the layer on `display`, taking the pointer, with the cursor drawn
     * from its first frame. */
    show(display, cursor) {
      const layer = layerFor(display);
      if (!layer) return;
      current = layer;
      layer.claims = (layer.claims ?? 0) + 1;
      send(layer, "cursor", cursor);
      raiseWindow(layer, true);
    },
    hide() {
      hideLayer(current);
      current = null;
    },
    send(channel, value) {
      if (current) send(current, channel, value);
    },
    /** Thumbnails fly to Blink; resolves when they arrive (or give up). The
     * layer is click-through for the whole flight. */
    flight(items, to) {
      const first = items[0] && center(items[0].bounds);
      const layer =
        [...layers.values()].find(
          (l) => first && inside(l.display.bounds, first),
        ) ??
        current ??
        [...layers.values()][0];
      if (!layer) return Promise.resolve();
      // A pick already holding this layer keeps it: the thumbnails fly over it.
      const shared = layer === current && layer.active;
      if (!shared) current = null;
      const id = `flight-${++token}`;
      const claims = layer.claims ?? 0;
      return new Promise((resolve) => {
        flying.add(layer.win);
        const finish = () => {
          clearTimer(timer);
          flying.delete(layer.win);
          waiting.delete(id);
          // A pick that started while the thumbnails were still landing owns the
          // layer now; the flight's end must not hide it.
          if (!shared && (layer.claims ?? 0) === claims) hideLayer(layer);
          resolve();
        };
        const timer = setTimer(finish, FLIGHT_LIMIT);
        waiting.set(id, finish);
        if (!shared) raiseWindow(layer, false);
        send(layer, "flight", {
          items,
          to: clamp(to, layer.display.bounds),
          token: id,
        });
      });
    },
    dispose() {
      for (const name of events) screen.removeListener(name, sync);
      for (const layer of layers.values())
        if (!layer.win.isDestroyed()) layer.win.destroy();
      layers.clear();
    },
    count: () => layers.size,
    /** Layers with a capture in flight; the stacking poll keeps them over Blink. */
    flying: () => [...flying].filter((w) => !w.isDestroyed()),
  };
}
