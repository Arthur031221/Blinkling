import { timing } from "../shared/motion.mjs";
import { BrowserWindow, screen, globalShortcut, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { OverlayService } from "./service.mjs";
import { exactX11Bounds } from "./x11-bounds.mjs";
import { validateDrawing, validateRect } from "./validate.mjs";
import { overlayWindowOptions } from "./window-options.mjs";
/** One hidden window per display, kept and reused (N6.4). `entries` maps a
 * window's webContents id to {win, view, displayId}; `pool` holds the idle ones. */
const entries = new Map();
const pool = new Map();
let installed = false;
function entryFor(e) {
  if (e.senderFrame !== e.sender.mainFrame || !entries.has(e.sender.id))
    throw Error("Untrusted overlay");
  return entries.get(e.sender.id);
}
function initialHandlers() {
  if (installed) return;
  installed = true;
  ipcMain.handle("blinkling:overlay:init", (e) => entryFor(e).view);
  ipcMain.on("blinkling:overlay:regions", (e, list) => {
    entryFor(e).regions = regionsOf(list);
  });
  ipcMain.on("blinkling:overlay:nav", (e, dir) => {
    const entry = entryFor(e);
    if (["back", "next", "end"].includes(dir)) entry.win.emit("nav", dir);
  });
  ipcMain.on("blinkling:overlay:mark-click", (e, n) => {
    const entry = entryFor(e);
    if (Number.isInteger(n) && n >= 1 && n <= 99)
      entry.win.emit("mark-click", n);
  });
}
const KINDS = new Set(["badge", "label", "mark", "note"]);
const finite = (n) => Number.isFinite(n) && Math.abs(n) < 100000;
/** What the renderer says it drew, as [kind, x, y, width, height] in display
 * coordinates. */
function regionsOf(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 400)
    .filter(
      (r) => Array.isArray(r) && KINDS.has(r[0]) && r.slice(1, 5).every(finite),
    )
    .map(([kind, x, y, width, height]) => ({ kind, x, y, width, height }));
}
function viewFor(display, drawings, { theme = "system", avoid = [] }, seq) {
  if (!Array.isArray(drawings) || drawings.length > 24)
    throw Error("Invalid drawings");
  return {
    seq,
    width: display.bounds.width,
    height: display.bounds.height,
    drawings: drawings.map((d, i) => validateDrawing(d, display.bounds, i)),
    theme,
    avoid: avoid.map((rect) => validateRect(rect, display.bounds)),
  };
}
function sameBounds(a, b) {
  return ["x", "y", "width", "height"].every((k) => a[k] === b[k]);
}
function forget(win, id) {
  entries.delete(id);
  for (const [key, idle] of pool) if (idle.win === win) pool.delete(key);
}
/** The draw is finished when the renderer has laid out and measured every pill
 * for this sequence number; an error or the limit is reported by name. */
function drawn(win, seq) {
  return win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error("Overlay layout timed out")),${timing.guideLayout});
    function check(){
      if(document.body.dataset.error){clearTimeout(timer);reject(Error(document.body.dataset.error));}
      else if(document.body.dataset.drawn==="${seq}"){clearTimeout(timer);resolve();}
      else setTimeout(check,${timing.layoutPoll});
    }check();
  })`);
}
let sequence = 0;
async function build(display) {
  initialHandlers();
  const win = new BrowserWindow(
    overlayWindowOptions(
      display,
      fileURLToPath(new URL("./preload.cjs", import.meta.url)),
    ),
  );
  // macOS keeps a window under the menu bar unless it is told otherwise, which
  // would draw every mark that far above where it belongs.
  win.setBounds(display.bounds);
  win.on("page-title-updated", (event) => event.preventDefault());
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin")
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  const id = win.webContents.id;
  const entry = {
    win,
    view: null,
    displayId: display.id,
    bounds: display.bounds,
  };
  entries.set(id, entry);
  win.once("closed", () => forget(win, id));
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
  return entry;
}
/** Returns the display's pooled window, or builds the first one. The window
 * stays hidden until its drawing is ready, and is hidden again on release. */
export async function createOverlay(display, drawings, options = {}) {
  const seq = ++sequence;
  const view = viewFor(display, drawings, options, seq);
  let entry = pool.get(display.id);
  pool.delete(display.id);
  if (
    entry &&
    (entry.win.isDestroyed() || !sameBounds(entry.bounds, display.bounds))
  ) {
    if (!entry.win.isDestroyed()) entry.win.close();
    entry = null;
  }
  const reused = !!entry;
  try {
    entry ??= await build(display);
    entry.view = view;
    if (reused) entry.win.webContents.send("blinkling:overlay:draw", view);
    else
      await entry.win.loadFile(
        fileURLToPath(new URL("./index.html", import.meta.url)),
      );
    await drawn(entry.win, seq);
    entry.win.showInactive();
    return entry.win;
  } catch (error) {
    if (entry && !entry.win.isDestroyed()) entry.win.close();
    throw error;
  }
}
/** Hide and keep the window for the next answer; a second idle window for the
 * same display is a leftover and is closed. */
export function releaseOverlay(win) {
  if (win.isDestroyed()) return;
  const entry = entries.get(win.webContents.id);
  if (!entry || pool.has(entry.displayId)) return win.close();
  win.setIgnoreMouseEvents(true, { forward: true });
  win.hide();
  entry.regions = [];
  pool.set(entry.displayId, entry);
}
/** Everything a visible overlay draws that takes or marks a click, in screen
 * DIP; `only` narrows it to the kinds that take the mouse. */
export function overlayRegions(only) {
  const out = [];
  for (const entry of entries.values()) {
    if (entry.win.isDestroyed() || !entry.win.isVisible()) continue;
    for (const r of entry.regions ?? [])
      if (!only || only.includes(r.kind))
        out.push({
          kind: r.kind,
          x: r.x + entry.bounds.x,
          y: r.y + entry.bounds.y,
          width: r.width,
          height: r.height,
        });
  }
  return out;
}
/** The Electron-bound service; service.mjs holds the logic so it runs in node. */
export class DesktopOverlayService extends OverlayService {
  constructor(options = {}) {
    super({
      create: createOverlay,
      release: releaseOverlay,
      escape: globalShortcut,
      displays: screen,
      ...options,
    });
  }
  regions(only) {
    return overlayRegions(only);
  }
}
