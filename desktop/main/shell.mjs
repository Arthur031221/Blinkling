import { app, BrowserWindow, ipcMain, screen, globalShortcut } from "electron";
import { fileURLToPath } from "node:url";
import { keepAbove } from "./x11-stacking.mjs";
import { contains } from "./geometry.mjs";
import { captureScreen } from "../capture/index.mjs";
import { createOverlay } from "../overlay/index.mjs";
import {
  installCaptureGuide,
  featureActions,
} from "../capture/integration.mjs";

app.commandLine.appendSwitch("enable-transparent-visuals");
let blink;
let poll;
let overlay;
let features;
let regions = [];
const actions = new Set([
  "screen",
  "region",
  "full-page",
  "guide",
  "auto-explain",
  "chat",
  "settings",
  "help",
  ...featureActions,
]);
await app.whenReady();
const display = screen.getPrimaryDisplay();
blink = new BrowserWindow({
  x: display.workArea.x + display.workArea.width - 180,
  y: display.workArea.y + display.workArea.height - 240,
  width: 180,
  height: 240,
  transparent: true,
  frame: false,
  hasShadow: false,
  alwaysOnTop: true,
  focusable: false,
  resizable: false,
  show: false,
  webPreferences: {
    preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  },
});
blink.setAlwaysOnTop(true, "screen-saver");
if (process.platform === "darwin")
  blink.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
blink.setIgnoreMouseEvents(true, { forward: true });
const trusted = (event) =>
  event.sender === blink.webContents &&
  event.senderFrame === blink.webContents.mainFrame;
ipcMain.on("glimpselet:regions", (event, value) => {
  if (!trusted(event) || !Array.isArray(value) || value.length > 2048) return;
  if (
    value.every(
      (r) =>
        r &&
        typeof r === "object" &&
        ["x", "y", "width", "height"].every((k) => Number.isFinite(r[k])) &&
        r.width >= 0 &&
        r.height >= 0,
    )
  )
    regions = value;
});
ipcMain.handle("glimpselet:action", async (event, action) => {
  if (!trusted(event) || !actions.has(action))
    throw new Error("Invalid desktop action");
  const result = await features?.handle(action);
  if (result) return result;
  // Other buckets supply conversation and companion actions.
  return { ok: false, reason: `${action}: scaffold only` };
});
blink.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
blink.webContents.on("will-navigate", (event) => event.preventDefault());
await blink.loadFile(
  fileURLToPath(new URL("../renderer/index.html", import.meta.url)),
);
blink.showInactive();
const send = (value) => {
  if (!blink.isDestroyed()) blink.webContents.send("glimpselet:event", value);
};
features = installCaptureGuide({
  blink,
  windows: () => [blink, overlay].filter(Boolean),
  onCapture: (capture) => send({ type: "capture", capture }),
  onGuide: (guide) => send({ type: "guide", ...guide }),
  onState: (state) => send({ type: "capture-status", ...state }),
});
// The session owner binds its durable SessionBridge here at service composition.
// Capture resumption runs after renderer listeners are ready, without a second gesture.
void features
  .resume()
  .catch(() => send({ type: "capture-status", state: "retrying" }));
const stopStacking = await keepAbove(() =>
  [overlay, features.overlay.window, blink].filter(Boolean),
);
// Linux does not implement forwarded mousemove. Poll global cursor for hit regions.
// The character builder supplies silhouette scanlines, including arms and animation.
poll = setInterval(() => {
  const p = screen.getCursorScreenPoint();
  const b = blink.getBounds();
  blink.setIgnoreMouseEvents(
    !regions.some((r) => contains(r, { x: p.x - b.x, y: p.y - b.y })),
    { forward: true },
  );
}, 16);
app.on("will-quit", () => {
  features.dispose();
  clearInterval(poll);
  stopStacking();
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => app.quit());
// Only available in the explicitly launched test process; never a renderer IPC API.
if (process.env.GLIMPSELET_E2E === "1")
  globalThis.glimpseletTest = {
    blink,
    features,
    capture: () =>
      captureScreen(
        screen.getPrimaryDisplay(),
        [blink, overlay].filter(Boolean),
      ),
    overlay: async (drawings) => {
      overlay?.close();
      overlay = await createOverlay(screen.getPrimaryDisplay(), drawings);
      return overlay.id;
    },
  };
