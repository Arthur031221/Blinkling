import { app, BrowserWindow, ipcMain, screen, globalShortcut } from "electron";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { keepAbove } from "./x11-stacking.mjs";
import { contains, roundedContains } from "./geometry.mjs";
import { PlacementStore } from "./preferences.mjs";
import {
  defaultPlacement,
  snapPlacement,
  resolvePlacement,
  visiblePlacement,
} from "./placement.mjs";
import { validCommand, validRegions, actionNames } from "./ipc.mjs";
import { captureScreen } from "../capture/index.mjs";
import { createOverlay } from "../overlay/index.mjs";

app.commandLine.appendSwitch("enable-transparent-visuals");
// Native Wayland cannot position or hit-test this shell; use XWayland deliberately.
if (process.platform === "linux" && process.env.DISPLAY)
  app.commandLine.appendSwitch("ozone-platform", "x11");
if (process.env.GLIMPSELET_E2E === "1" && process.env.GLIMPSELET_TEST_DATA)
  app.setPath("userData", process.env.GLIMPSELET_TEST_DATA);
await app.whenReady();
const preferences = new PlacementStore(
  join(app.getPath("userData"), "blink-positions.json"),
);
await preferences.load();
let quitting = false;
app.on("before-quit", () => {
  quitting = true;
});
let display = screen.getPrimaryDisplay(),
  placement = preferences.get(display.id) ?? defaultPlacement(display),
  pinned = false,
  dragging = null,
  card,
  overlay,
  regions = [],
  lastInside = false,
  awaySince = 0;
const preload = fileURLToPath(new URL("../preload/index.cjs", import.meta.url));
const webPreferences = {
  preload,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
};
const options = {
  transparent: true,
  backgroundColor: "#00000000",
  frame: false,
  hasShadow: false,
  alwaysOnTop: true,
  resizable: false,
  show: false,
  skipTaskbar: true,
  webPreferences,
};
const blink = new BrowserWindow({
  ...options,
  ...display.workArea,
  focusable: false,
});
const owned = () => [overlay, card, blink].filter((w) => w && !w.isDestroyed());
function secure(win) {
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin")
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
}
secure(blink);
blink.setIgnoreMouseEvents(true, { forward: true });
function snapshot() {
  const peek = dragging?.active
    ? dragging.point
    : resolvePlacement(placement, display);
  return {
    displayId: String(display.id),
    workArea: { ...display.workArea },
    edge: placement.edge,
    peek,
    revealed: visiblePlacement(peek, display),
    pinned,
    dragging: Boolean(dragging?.active),
    chatOpen: Boolean(card?.isVisible()),
  };
}
function broadcast(rebase = false) {
  const event = { type: "state", state: snapshot(), rebase };
  for (const w of [blink, card])
    if (w && !w.isDestroyed()) w.webContents.send("glimpselet:shell", event);
}
function trusted(event) {
  return [blink, card].some(
    (w) =>
      w &&
      !w.isDestroyed() &&
      event.sender === w.webContents &&
      event.senderFrame === w.webContents.mainFrame,
  );
}
function cardBounds() {
  const b = display.workArea,
    p = snapshot().revealed,
    width = Math.min(460, Math.max(240, b.width - 214)),
    height = Math.min(540, b.height);
  return {
    width,
    height,
    x: Math.round(
      b.x +
        Math.max(
          0,
          Math.min(
            b.width - width,
            p.x > b.width / 2 ? p.x - width - 72 : p.x + 72,
          ),
        ),
    ),
    y: Math.round(
      b.y + Math.max(0, Math.min(b.height - height, p.y + 80 - height)),
    ),
  };
}
function closeCard(force = false) {
  if (pinned && !force) return;
  if (card?.isVisible()) {
    card.hide();
    if (process.platform === "darwin") {
      app.hide();
      blink.showInactive();
    }
    broadcast();
  }
}
async function openCard() {
  if (!card || card.isDestroyed()) {
    card = new BrowserWindow({ ...options, ...cardBounds(), focusable: true });
    secure(card);
    card.on("close", (event) => {
      if (quitting) return;
      event.preventDefault();
      pinned = false;
      closeCard(true);
    });
    card.on("blur", () => {
      awaySince = Date.now();
    });
    await card.loadFile(
      fileURLToPath(new URL("../renderer/card.html", import.meta.url)),
    );
  }
  card.setBounds(cardBounds());
  card.show();
  card.focus();
  awaySince = 0;
  broadcast();
}
ipcMain.on("glimpselet:regions", (event, value) => {
  if (
    event.sender !== blink.webContents ||
    !trusted(event) ||
    !validRegions(value, blink.getBounds())
  )
    return;
  regions = value;
});
ipcMain.handle("glimpselet:shell", async (event, command) => {
  if (!trusted(event) || !validCommand(command, blink.getBounds()))
    throw new Error("Invalid shell command");
  if (command.type === "pin") {
    pinned = command.value;
    awaySince = Date.now();
    broadcast();
  }
  if (command.type === "close-chat") {
    pinned = false;
    closeCard(true);
    broadcast();
  }
  if (command.type === "drag-start") {
    if (event.sender !== blink.webContents)
      throw new Error("Only Blink can be dragged");
    const cursor = screen.getCursorScreenPoint();
    const p = command.anchor;
    dragging = {
      start: cursor,
      origin: { x: display.workArea.x + p.x, y: display.workArea.y + p.y },
      point: p,
      active: false,
    };
  }
  if (command.type === "drag-end" && dragging) {
    let save;
    if (dragging.active) {
      placement = snapPlacement(
        {
          x: display.workArea.x + dragging.point.x,
          y: display.workArea.y + dragging.point.y,
        },
        display,
      );
      save = preferences.set(display.id, placement);
    }
    dragging = null;
    if (card && !card.isDestroyed()) card.setBounds(cardBounds());
    broadcast();
    await save;
  }
  return snapshot();
});
// The shell owns dispatch/window policy; feature buckets register implementations.
const handlers = new Map();
ipcMain.handle("glimpselet:action", async (event, action) => {
  if (!trusted(event) || !actionNames.has(action))
    throw new Error("Invalid desktop action");
  if (action === "chat") {
    await openCard();
    return { ok: true };
  }
  const handler = handlers.get(action);
  return handler
    ? await handler({ display, openCard, windows: owned })
    : { ok: false, reason: `${action}: service pending` };
});
function switchDisplay(next, restore = true) {
  display = next;
  if (restore)
    placement = preferences.get(display.id) ?? defaultPlacement(display);
  regions = [];
  blink.setIgnoreMouseEvents(true, { forward: true });
  blink.setBounds(display.workArea);
  overlay?.close();
  overlay = undefined; // Never retain an overlay against stale display geometry.
  if (card && !card.isDestroyed()) card.setBounds(cardBounds());
  broadcast(true);
}
function reconcileDisplays() {
  const next =
    screen.getAllDisplays().find((d) => String(d.id) === String(display.id)) ??
    screen.getPrimaryDisplay();
  if (dragging) dragging = null;
  switchDisplay(next);
}
screen.on("display-added", reconcileDisplays);
screen.on("display-removed", reconcileDisplays);
screen.on("display-metrics-changed", reconcileDisplays);
await blink.loadFile(
  fileURLToPath(new URL("../renderer/index.html", import.meta.url)),
);
blink.showInactive();
const stopStacking = await keepAbove(() =>
  owned().filter((w) => !w.isFocusable()),
);
const poll = setInterval(() => {
  if (blink.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  if (dragging) {
    const delta = {
      x: cursor.x - dragging.start.x,
      y: cursor.y - dragging.start.y,
    };
    if (Math.hypot(delta.x, delta.y) > 5) dragging.active = true;
    if (dragging.active) {
      const next = screen.getDisplayNearestPoint(cursor);
      if (String(next.id) !== String(display.id)) switchDisplay(next, false);
      dragging.point = {
        x: dragging.origin.x + delta.x - display.workArea.x,
        y: dragging.origin.y + delta.y - display.workArea.y,
      };
      broadcast();
    }
  }
  const b = blink.getBounds(),
    hit =
      blink.isVisible() &&
      regions.some((r) =>
        contains(r, { x: cursor.x - b.x, y: cursor.y - b.y }),
      );
  blink.setIgnoreMouseEvents(!dragging && !hit, { forward: true });
  if (hit !== lastInside) {
    lastInside = hit;
    blink.webContents.send("glimpselet:shell", {
      type: "pointer",
      inside: hit,
    });
  }
  const cb = card?.isVisible() ? card.getBounds() : null;
  const inCard =
    cb &&
    roundedContains(
      {
        x: cb.x + 8,
        y: cb.y + 8,
        width: cb.width - 16,
        height: cb.height - 16,
      },
      cursor,
      24,
    );
  if (cb) card.setIgnoreMouseEvents(!inCard, { forward: true });
  if (hit || inCard || card?.isFocused() || dragging) awaySince = 0;
  else {
    if (!awaySince) awaySince = Date.now();
    if (Date.now() - awaySince >= 1500) closeCard();
  }
}, 16);
app.on("will-quit", () => {
  clearInterval(poll);
  stopStacking();
  globalShortcut.unregisterAll();
  card?.destroy();
});
app.on("window-all-closed", () => app.quit());
export const desktopShell = Object.freeze({
  windows: owned,
  display: () => display,
  state: snapshot,
  openCard,
  registerAction(action, handler) {
    if (!actionNames.has(action) || typeof handler !== "function")
      throw new Error("Invalid action handler");
    handlers.set(action, handler);
    return () => {
      if (handlers.get(action) === handler) handlers.delete(action);
    };
  },
  emit(event) {
    for (const w of [blink, card])
      if (w && !w.isDestroyed()) w.webContents.send("glimpselet:event", event);
  },
});
if (process.env.GLIMPSELET_E2E === "1")
  globalThis.glimpseletTest = {
    blink,
    get card() {
      return card;
    },
    state: snapshot,
    preferences,
    reconcileDisplays,
    setDisplay: (next) => switchDisplay(next),
    capture: () => captureScreen(display, owned()),
    overlay: async (drawings) => {
      overlay?.close();
      overlay = await createOverlay(display, drawings);
      return overlay.id;
    },
    shell: desktopShell,
  };
