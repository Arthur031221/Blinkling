import { BrowserWindow, screen, globalShortcut, ipcMain } from "electron";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { captureMatchesDisplay } from "./schema.mjs";
import { exactX11Bounds } from "./x11-bounds.mjs";
const views = new Map();
let installed = false;
function initialHandlers() {
  if (installed) return;
  installed = true;
  ipcMain.handle("glimpselet:overlay:init", (e) => {
    if (e.senderFrame !== e.sender.mainFrame || !views.has(e.sender.id))
      throw Error("Untrusted overlay");
    return views.get(e.sender.id);
  });
}
function validateDrawing(d, bounds, i) {
  const r = d?.rect;
  if (
    !r ||
    !["x", "y", "width", "height"].every((k) => Number.isFinite(r[k])) ||
    r.x < 0 ||
    r.y < 0 ||
    r.width <= 0 ||
    r.height <= 0 ||
    r.x + r.width > bounds.width ||
    r.y + r.height > bounds.height
  )
    throw Error("Invalid drawing");
  if (
    d.label !== undefined &&
    (typeof d.label !== "string" || d.label.length > 80)
  )
    throw Error("Invalid drawing label");
  const steps = d.steps ?? (Number.isInteger(d.step) ? [d.step] : []);
  if (
    !Array.isArray(steps) ||
    steps.length > 24 ||
    steps.some((s) => !Number.isInteger(s) || s < -1 || s > 23)
  )
    throw Error("Invalid drawing step");
  const point = (p) => {
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x > bounds.width ||
      p.y > bounds.height
    )
      throw Error("Invalid arrow");
    return { x: p.x, y: p.y };
  };
  if (
    d.arrows !== undefined &&
    (!Array.isArray(d.arrows) || d.arrows.length > 192)
  )
    throw Error("Invalid arrows");
  return {
    id: String(d.id ?? i),
    rect: { ...r },
    label: d.label ?? "",
    number: i + 1,
    steps,
    arrows: (d.arrows ?? []).map((a) => ({
      from: point(a.from),
      to: point(a.to),
      step: Number.isInteger(a.step) ? a.step : -1,
    })),
  };
}
export async function createOverlay(
  display,
  drawings,
  { step = -1, theme = "system", avoid = [] } = {},
) {
  if (!Array.isArray(drawings) || drawings.length > 24)
    throw Error("Invalid drawings");
  const initial = {
    width: display.bounds.width,
    height: display.bounds.height,
    drawings: drawings.map((d, i) => validateDrawing(d, display.bounds, i)),
    step,
    theme,
    avoid: avoid.map(
      (rect, i) => validateDrawing({ rect }, display.bounds, i).rect,
    ),
  };
  initialHandlers();
  const win = new BrowserWindow({
    ...display.bounds,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    resizable: false,
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
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  const id = win.webContents.id;
  views.set(id, initial);
  win.once("closed", () => views.delete(id));
  try {
    if (process.platform === "linux" && process.env.DISPLAY) {
      const origin = screen.dipToScreenPoint({
        x: display.bounds.x,
        y: display.bounds.y,
      });
      await exactX11Bounds(
        win,
        {
          ...origin,
          width: Math.round(display.bounds.width * display.scaleFactor),
          height: Math.round(display.bounds.height * display.scaleFactor),
        },
        display.id,
      );
    }
    await win.loadFile(fileURLToPath(new URL("./index.html", import.meta.url)));
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error("Guide layout timed out")),3000);
      function check(){
        if(document.body.dataset.error){clearTimeout(timer);reject(Error(document.body.dataset.error));}
        else if(document.body.dataset.ready){clearTimeout(timer);resolve();}
        else setTimeout(check,10);
      }check();
    })`);
    win.showInactive();
    return win;
  } catch (error) {
    win.close();
    throw error;
  }
}
export class DesktopOverlayService extends EventEmitter {
  constructor({
    onDismiss = () => {},
    create = createOverlay,
    escape = globalShortcut,
    displays = screen,
    windows = () => [],
  } = {}) {
    super();
    this.epoch = 0;
    Object.assign(this, { onDismiss, create, escape, displays, windows });
    this.invalidate = () => {
      if (
        this.capture &&
        !captureMatchesDisplay(
          this.capture,
          this.displays
            .getAllDisplays()
            .find((d) => String(d.id) === this.capture.display.id),
        )
      )
        this.dismiss("display-changed");
    };
    for (const name of [
      "display-metrics-changed",
      "display-removed",
      "display-added",
    ])
      displays.on(name, this.invalidate);
  }
  async show(capture, drawings) {
    this.dismiss("replaced");
    if (
      !captureMatchesDisplay(
        capture,
        this.displays
          .getAllDisplays()
          .find((d) => String(d.id) === capture.display.id),
      )
    )
      throw Error("Guide capture is stale");
    if (!this.escape.register("Escape", () => this.dismiss("escape")))
      throw Error("Guide Escape shortcut unavailable");
    this.capture = capture;
    this.drawings = drawings;
    const epoch = this.epoch;
    try {
      const b = capture.display.bounds;
      const avoid = this.windows()
        .filter((w) => w && !w.isDestroyed() && w.isVisible())
        .map((w) => {
          const r = w.getBounds();
          const x = Math.max(0, r.x - b.x),
            y = Math.max(0, r.y - b.y);
          return {
            x,
            y,
            width: Math.min(b.width, r.x + r.width - b.x) - x,
            height: Math.min(b.height, r.y + r.height - b.y) - y,
          };
        })
        .filter((r) => r.width > 0 && r.height > 0);
      const window = await this.create(capture.display, drawings, { avoid });
      if (
        this.epoch !== epoch ||
        !captureMatchesDisplay(
          capture,
          this.displays
            .getAllDisplays()
            .find((d) => String(d.id) === capture.display.id),
        )
      ) {
        window.close();
        return false;
      }
      this.window = window;
    } catch (error) {
      if (this.epoch === epoch) this.dismiss("failed");
      throw error;
    }
    const window = this.window;
    window.once("closed", () => {
      if (this.window === window) this.dismiss("closed");
    });
    this.emit("shown", capture);
    return true;
  }
  step(index) {
    if (!Number.isInteger(index) || index < -1 || index > 23)
      throw Error("Invalid guide step");
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send("glimpselet:overlay:step", index);
  }
  dismiss(reason = "dismissed") {
    this.epoch++;
    const active = !!this.capture;
    const window = this.window;
    this.capture = null;
    this.drawings = null;
    this.window = null;
    if (active) this.escape.unregister("Escape");
    if (window && !window.isDestroyed()) window.close();
    if (active) {
      this.onDismiss(reason);
      this.emit("dismissed", reason);
    }
  }
  dispose() {
    this.dismiss();
    for (const name of [
      "display-metrics-changed",
      "display-removed",
      "display-added",
    ])
      this.displays.removeListener(name, this.invalidate);
  }
}
