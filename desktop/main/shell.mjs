import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  nativeTheme,
  shell as externalShell,
} from "electron";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import {
  claimFocus,
  leaveCloses,
  noHold,
  sendCloses,
  validHold,
} from "./card-hold.mjs";
import { validSeed } from "../composer/index.mjs";
import { keepAbove, stackOrder } from "./x11-stacking.mjs";
import { nativeInput } from "./native-input.mjs";
import { cursorSource } from "./cursor.mjs";
import { contains } from "./geometry.mjs";
import {
  resolvePosition,
  snapPosition,
  reconcileDisplay,
  cardBounds,
} from "./placement.mjs";
import { PositionStore } from "./preferences.mjs";
import { validCommand, validRegions } from "./ipc.mjs";
import { dispatchAction, registerAction } from "./services.mjs";
import { captureScreen } from "../capture/index.mjs";
import { createOverlay } from "../overlay/index.mjs";
import {
  installCaptureGuide,
  featureActions,
} from "../capture/integration.mjs";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { SessionBridge } from "../session/index.mjs";
import { runFullPage } from "../capture/full-page.mjs";
let features;
const companionModule = new URL("../companion/host.mjs", import.meta.url);
const companionDirectory = existsSync(fileURLToPath(companionModule))
  ? new URL("../companion/", import.meta.url)
  : new URL("../../plugin/desktop/", import.meta.url);
const { adoptLegacyEnv, migrateLegacyData } = await import(
  new URL("legacy.mjs", companionDirectory).href
);
adoptLegacyEnv();
await migrateLegacyData().catch(() => undefined);
const { startDesktopHost } = await import(
  new URL("host.mjs", companionDirectory).href
);
if (process.env.BLINKLING_RUNTIME_DIR)
  app.setPath(
    "userData",
    join(resolve(process.env.BLINKLING_RUNTIME_DIR), "electron"),
  );
if (process.env.BLINKLING_E2E === "1")
  app.setPath(
    "userData",
    process.env.BLINKLING_TEST_DATA ??
      mkdtempSync(join(tmpdir(), "blinkling-shell-")),
  );
if (!app.requestSingleInstanceLock()) app.exit(0);

app.commandLine.appendSwitch("enable-transparent-visuals");
// Absolute desktop placement needs XWayland on Linux; native Wayland forbids it.
if (process.platform === "linux" && process.env.DISPLAY)
  app.commandLine.appendSwitch("ozone-platform", "x11");
await app.whenReady();
const store = await new PositionStore(
  join(app.getPath("userData"), "blink-positions.json"),
).load();
let display = reconcileDisplay(
  screen.getAllDisplays(),
  store.lastDisplay ?? screen.getPrimaryDisplay().id,
);
let position = resolvePosition(display, store.positions[String(display.id)]);
let composer = null,
  composerOpening = null,
  composerReady = null,
  bubbles = null,
  bubbleRegions = [],
  answersVisible = false,
  typing = false,
  overlay = null,
  regions = [],
  drag = null,
  pinned = false,
  chatOpen = false,
  cardHold = noHold,
  leaving = false,
  autoExplain = false,
  quitting = false;
let previousCursor = "",
  previousFocused = null,
  ignoring = true;
const input = await nativeInput();
const cursor = cursorSource({
  query: input?.pointer,
  fallback: () => screen.getCursorScreenPoint(),
  toDip: (point) => screen.screenToDipPoint(point),
});
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
const webPreferences = {
  preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  backgroundThrottling: false,
};
function windowOptions(bounds, focusable) {
  return {
    ...bounds,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    focusable,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences,
  };
}
function secure(win) {
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin")
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
}
const blink = new BrowserWindow(windowOptions(display.bounds, false));
secure(blink);
blink.setIgnoreMouseEvents(true, { forward: true });
const windows = () =>
  [composer, bubbles, overlay, blink].filter((w) => w && !w.isDestroyed());
const snapshot = () => ({
  display: {
    id: String(display.id),
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
  },
  position,
  drag: drag?.active
    ? {
        x: drag.anchor.x - display.bounds.x,
        y: drag.anchor.y - display.bounds.y,
        velocity: drag.velocity,
      }
    : null,
  pinned,
  chatOpen,
  chatFocused: !!composer && !composer.isDestroyed() && composer.isFocused(),
  autoExplain,
  theme: nativeTheme.shouldUseDarkColors ? "dark" : "light",
});
function broadcast() {
  if (quitting) return;
  for (const w of windows())
    w.webContents.send("blinkling:shell", {
      type: "state",
      state: snapshot(),
    });
}
function shapeComposer() {
  if (!composer) return;
  const b = composer.getBounds(),
    rs = [];
  const r = 26;
  const height = b.height - 28;
  for (let y = 0; y < height; y++) {
    const dy = Math.max(0, r - Math.min(y + 0.5, height - y - 0.5)),
      inset = dy ? r - Math.sqrt(r * r - dy * dy) : 0;
    const x = Math.ceil(inset);
    rs.push({ x: x + 12, y: y + 12, width: b.width - 24 - 2 * x, height: 1 });
  }
  if (input) {
    // Shape the WM frame's input as well, preserving the compositor's alpha.
    input.setRegions(composer, rs, display.scaleFactor, true);
  } else if (process.platform === "win32") composer.setShape(rs);
}
async function ensureComposer() {
  if (composerOpening) return composerOpening;
  if (composer) return composer;
  const win = new BrowserWindow(
    windowOptions(cardBounds(display, position), true),
  );
  composer = win;
  secure(win);
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      closeComposer();
    }
  });
  win.on("focus", () => {
    shapeComposer();
    broadcast();
  });
  win.on("blur", () => {
    broadcast();
    if (!pinned)
      blink.webContents.send("blinkling:shell", { type: "chat-blur" });
    leaveIfIdle();
  });
  let timer;
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(Error("Composer startup timed out")),
      10000,
    );
    composerReady = () => {
      clearTimeout(timer);
      resolve();
    };
    win.once("closed", () => {
      clearTimeout(timer);
      reject(Error("Composer closed during startup"));
    });
  });
  // The renderer can fail or close while loadFile is still pending.
  ready.catch(() => {});
  composerOpening = (async () => {
    await win.loadFile(
      fileURLToPath(new URL("../composer/index.html", import.meta.url)),
      { query: { surface: "card" } },
    );
    await ready;
    shapeComposer();
    return win;
  })()
    .catch((error) => {
      clearTimeout(timer);
      if (composer === win) composer = null;
      if (!win.isDestroyed()) win.destroy();
      throw error;
    })
    .finally(() => {
      composerOpening = null;
      composerReady = null;
    });
  return composerOpening;
}
ipcMain.on("blinkling:composer-ready", (event) => {
  if (
    event.sender === composer?.webContents &&
    event.senderFrame === event.sender.mainFrame
  )
    composerReady?.();
});
/** Open the card. `focus` gives it the keyboard; `seed` is what the mini
 * composer was holding ({ conversationId, draft, attachments }), carried into
 * the card as it grows. */
async function openComposer({ focus = true, seed } = {}) {
  const carried = seed === undefined ? undefined : validSeed(seed);
  if (!composer?.isVisible() || (focus && !composer?.isFocused())) {
    previousFocused = BrowserWindow.getFocusedWindow();
    await input?.rememberFocus();
  }
  const win = await ensureComposer();
  chatOpen = true;
  bubbles?.hide();
  win.webContents.send("blinkling:surface", {
    type: "open",
    ...(carried && { seed: carried }),
  });
  broadcast();
  if (focus) {
    if (input) {
      win.showInactive();
      input.activate(win);
    } else {
      win.show();
      win.focus();
    }
    shapeComposer();
    win.webContents.send("blinkling:surface", { type: "open" });
    claimKeyboard(win, 250);
  } else if (!win.isVisible()) win.showInactive();
}
/** Blink asked to close the card because the pointer left, but something held
 * it. Close it as soon as nothing does, without waiting for another leave. */
function leaveIfIdle() {
  if (
    leaveCloses({
      open: chatOpen,
      pinned,
      leaving,
      focused: composer?.isFocused(),
      draft: typing,
      ...cardHold,
    })
  )
    closeComposer();
}
/** A window manager may hand the keyboard to another window just after the
 * card opens (the window that closed, a focus revert). For a short settle
 * period, ask again whenever the card does not have it; after that a click
 * elsewhere is the user's decision and wins. */
let cancelClaim = null;
function claimKeyboard(win, settle = 600) {
  cancelClaim?.();
  cancelClaim = claimFocus({
    settle,
    focused: () => win.isFocused(),
    wanted: () => !win.isDestroyed() && win.isVisible() && chatOpen,
    claim: () => {
      if (input) input.activate(win);
      win.focus();
      win.webContents.send("blinkling:surface", { type: "open" });
    },
  });
}
function closeComposer(restore = true) {
  cancelClaim?.();
  leaving = false;
  const focused = composer?.isFocused();
  chatOpen = false;
  pinned = false;
  composer?.hide();
  if (answersVisible) bubbles?.showInactive();
  if (restore && focused) {
    if (previousFocused && !previousFocused.isDestroyed()) {
      previousFocused.focus();
      input?.activate(previousFocused);
    } else if (input) input.restoreFocus();
    else if (process.platform === "darwin") {
      app.hide();
      blink.showInactive();
    }
  }
  broadcast();
}
function useDisplay(next) {
  display = next;
  position = resolvePosition(display, store.positions[String(display.id)]);
  regions = [];
  blink.setBounds(display.bounds);
  if (input)
    input.setRegions(
      blink,
      drag
        ? [
            {
              x: 0,
              y: 0,
              width: display.bounds.width,
              height: display.bounds.height,
            },
          ]
        : [],
      display.scaleFactor,
    );
  placeCard();
  broadcast();
}
/** The card and the answer deck share one rectangle; move them together. */
function placeCard() {
  const bounds = cardBounds(display, position);
  composer?.setBounds(bounds);
  bubbles?.setBounds(bounds);
  shapeComposer();
}
function displaysChanged() {
  const next = reconcileDisplay(screen.getAllDisplays(), display.id);
  drag = null;
  overlay?.close();
  overlay = null;
  useDisplay(next);
}
screen.on("display-added", displaysChanged);
screen.on("display-removed", displaysChanged);
screen.on("display-metrics-changed", displaysChanged);
nativeTheme.on("updated", broadcast);
const trusted = (event) =>
  windows().some(
    (w) =>
      event.sender === w.webContents &&
      event.senderFrame === w.webContents.mainFrame,
  );
ipcMain.on("blinkling:regions", (event, value) => {
  if (
    event.sender !== blink.webContents ||
    !trusted(event) ||
    !validRegions(value, blink.getBounds())
  )
    return;
  regions = value;
  if (input) {
    if (ignoring) blink.setIgnoreMouseEvents(false);
    if (!drag) input.setRegions(blink, regions, display.scaleFactor);
    ignoring = false;
  } else if (!drag && process.platform === "win32" && regions.length)
    blink.setShape(regions);
});
ipcMain.handle("blinkling:shell", async (event, command) => {
  if (!trusted(event) || !validCommand(command, blink.getBounds()))
    throw new Error("Invalid shell command");
  if (command.type === "drag-start")
    command = { type: "drag", phase: "start", anchor: command.anchor };
  if (command.type === "drag-end") command = { type: "drag", phase: "end" };
  const fromBlink = event.sender === blink.webContents;
  if (command.type === "drag") {
    if (!fromBlink) throw new Error("Invalid shell gesture");
    const p = cursor.point();
    if (command.phase === "start") {
      if (
        !regions.some((r) =>
          contains(r, { x: p.x - display.bounds.x, y: p.y - display.bounds.y }),
        )
      )
        throw new Error("Drag must start on Blink");
      drag = {
        active: false,
        start: p,
        origin: {
          x: (command.anchor?.x ?? position.reveal.x) + display.bounds.x,
          y: (command.anchor?.y ?? position.reveal.y) + display.bounds.y,
        },
        anchor: {
          x: (command.anchor?.x ?? position.reveal.x) + display.bounds.x,
          y: (command.anchor?.y ?? position.reveal.y) + display.bounds.y,
        },
        lastX: p.x,
        velocity: 0,
      };
      // Keep the native pointer capture alive while the rig moves under it.
      // The window remains nonfocusable; ordinary hit testing resumes on release.
      const full = [
        {
          x: 0,
          y: 0,
          width: display.bounds.width,
          height: display.bounds.height,
        },
      ];
      if (input) input.setRegions(blink, full, display.scaleFactor);
      else if (process.platform === "win32") blink.setShape(full);
    } else if (drag) {
      const saved = drag.active ? snapPosition(display, drag.anchor) : null;
      if (saved) position = resolvePosition(display, saved);
      drag = null;
      if (input) input.setRegions(blink, regions, display.scaleFactor);
      else if (process.platform === "win32") blink.setShape(regions);
      if (saved) await store.save(display.id, saved);
      placeCard();
    }
  } else if (command.type === "pin") {
    pinned = command.value;
    if (pinned) await openComposer({ focus: false });
    else {
      // Unpinning dismisses the card, but never over an unsent draft or an
      // open file dialog; it closes as soon as nothing holds it.
      leaving = true;
      if (
        leaveCloses({
          open: chatOpen,
          pinned,
          leaving,
          draft: typing,
          ...cardHold,
        })
      )
        closeComposer();
    }
  } else if (command.type === "close-chat") closeComposer();
  else if (command.type === "visibility") {
    if (command.value && !chatOpen) await openComposer({ focus: false });
    else if (command.value) leaving = false;
    else if (!command.value && !pinned && chatOpen) {
      leaving = true;
      leaveIfIdle();
    }
  } else if (command.type === "activity") {
    if (fromBlink || event.sender !== composer?.webContents)
      throw new Error("Invalid composer activity");
    blink.webContents.send("blinkling:shell", { type: "chat-activity" });
  }
  broadcast();
  return snapshot();
});
for (const view of ["settings", "help"])
  registerAction(view, async () => {
    await openComposer();
    composer.webContents.send("blinkling:surface", { type: "view", view });
    return { ok: true };
  });
ipcMain.handle("blinkling:action", async (event, action) => {
  if (!trusted(event) || !actions.has(action))
    throw new Error("Invalid desktop action");
  if (action === "chat") {
    await openComposer();
    return { ok: true };
  }
  if (action === "auto-explain") {
    const result = await dispatchAction(action, {
      display,
      windows: windows(),
      enabled: !autoExplain,
    });
    if (result.ok) {
      autoExplain = !autoExplain;
      broadcast();
    }
    return result;
  }
  return dispatchAction(action, { display, windows: windows(), openComposer });
});
const send = (event) => {
  for (const win of windows()) win.webContents.send("blinkling:event", event);
};
const session = new SessionBridge({
  userDataDir: app.getPath("userData"),
  cwd:
    process.env.BLINKLING_CWD ??
    (process.env.BLINKLING_E2E === "1" && process.env.BLINKLING_LIVE !== "1"
      ? app.getPath("userData")
      : process.cwd()),
  executable:
    process.env.BLINKLING_CLAUDE ??
    (process.env.BLINKLING_E2E === "1" && process.env.BLINKLING_LIVE !== "1"
      ? fileURLToPath(
          new URL("../session/e2e/fake-claude.fixture.mjs", import.meta.url),
        )
      : "claude"),
});
session.subscribe(send, { visible: true });
const requireView = (event) => {
  if (
    !trusted(event) ||
    ![composer?.webContents, bubbles?.webContents].includes(event.sender)
  )
    throw new Error("Invalid conversation sender");
};
ipcMain.handle("blinkling:configuration", (event) => {
  requireView(event);
  return {
    surface: event.sender === bubbles?.webContents ? "bubbles" : "card",
    selection: session.state?.selection,
    theme: snapshot().theme,
  };
});
ipcMain.on("blinkling:subscribe", (event) => {
  if (!trusted(event)) return;
  const unsubscribe = session.subscribe(
    (value) => event.sender.send("blinkling:event", value),
    { visible: true },
  );
  unsubscribe();
});
ipcMain.handle("blinkling:send", async (event, turn) => {
  requireView(event);
  if (event.sender !== composer?.webContents)
    throw new Error("Invalid composer sender");
  await session.send(turn);
  if (sendCloses({ pinned, pointer: cardHold.pointer, source: turn.source }))
    closeComposer();
});
ipcMain.handle("blinkling:select", (event, selection) => {
  requireView(event);
  return session.select(selection);
});
ipcMain.handle("blinkling:stop", (event) => {
  requireView(event);
  return session.stop();
});
ipcMain.handle("blinkling:open-chat", async (event, messageId) => {
  requireView(event);
  if (
    messageId !== undefined &&
    (typeof messageId !== "string" || messageId.length > 200)
  )
    throw new Error("Invalid message ID");
  await openComposer();
  composer.webContents.send("blinkling:surface", { type: "open", messageId });
});
ipcMain.handle("blinkling:open-link", async (event, url) => {
  requireView(event);
  if (typeof url !== "string" || url.length > 4096 || !/^https?:\/\//.test(url))
    throw new Error("Invalid link");
  await externalShell.openExternal(new URL(url).href);
});
ipcMain.on("blinkling:typing", (event, value) => {
  if (
    !trusted(event) ||
    event.sender !== composer?.webContents ||
    typeof value !== "boolean"
  )
    return;
  typing = value;
  blink.webContents.send("blinkling:shell", { type: "chat-activity" });
  leaveIfIdle();
});
ipcMain.on("blinkling:hold", (event, value) => {
  const hold = validHold(value);
  if (!trusted(event) || event.sender !== composer?.webContents || !hold)
    return;
  cardHold = hold;
  leaveIfIdle();
});
ipcMain.on("blinkling:activity", (event, value) => {
  if (
    !trusted(event) ||
    event.sender !== bubbles?.webContents ||
    typeof value?.visible !== "boolean" ||
    typeof value?.speaking !== "boolean"
  )
    return;
  answersVisible = value.visible;
  if (answersVisible && !chatOpen) bubbles.showInactive();
  else bubbles.hide();
  blink.webContents.send("blinkling:shell", {
    type: "answer-activity",
    ...value,
  });
});
ipcMain.on("blinkling:bubble-regions", (event, value) => {
  if (
    !trusted(event) ||
    event.sender !== bubbles?.webContents ||
    !validRegions(value, bubbles.getBounds())
  )
    return;
  bubbleRegions = value;
  if (input) input.setRegions(bubbles, value, display.scaleFactor);
  else if (process.platform === "win32") bubbles.setShape(value);
});
bubbles = new BrowserWindow(
  windowOptions(cardBounds(display, position), false),
);
secure(bubbles);
bubbles.setIgnoreMouseEvents(!input && process.platform !== "win32", {
  forward: true,
});
await blink.loadFile(
  fileURLToPath(new URL("../renderer/index.html", import.meta.url)),
);
await bubbles.loadFile(
  fileURLToPath(new URL("../composer/index.html", import.meta.url)),
);
blink.showInactive();
const companionHost = await startDesktopHost({
  ...(process.env.BLINKLING_E2E === "1"
    ? (() => {
        const directory =
          process.env.BLINKLING_RUNTIME_DIR ??
          join(app.getPath("userData"), "runtime");
        return { directory, descriptor: join(directory, "desktop.json") };
      })()
    : {}),
  session,
  onOpen: () => blink.showInactive(),
  onShutdown: () => app.quit(),
});
globalThis.blinklingCompanion = companionHost;
const visualMasks = () =>
  windows()
    .filter((w) => w.isVisible())
    .flatMap((w) => {
      const b = w.getBounds();
      const shape =
        w === blink
          ? regions
          : w === bubbles
            ? bubbleRegions
            : [{ x: 0, y: 0, width: b.width, height: b.height }];
      return shape.map((r) => ({
        ...r,
        x: r.x + b.x - display.bounds.x,
        y: r.y + b.y - display.bounds.y,
      }));
    });
const attachCapture = async (capture) => {
  await openComposer();
  // Only a capture re-claims the keyboard: the selector that just closed hands
  // it back to the previous window, but a user click elsewhere must win.
  claimKeyboard(composer);
  composer.webContents.send("blinkling:capture", capture);
  send({ type: "capture", capture });
};
features = installCaptureGuide({
  blink,
  windows,
  session,
  masks: visualMasks,
  busy: () => typing || !!session.active,
  onCapture: attachCapture,
  onGuide: (guide) => {
    send({ type: "guide", ...guide });
    if (guide.phase !== "dismissed" && !chatOpen) bubbles.showInactive();
  },
  onState: (state) => send({ type: "capture-status", ...state }),
});
for (const action of featureActions)
  registerAction(action, () => features.handle(action));
registerAction("full-page", () => {
  // Show the pending message in the bubbles at once, even if they were hidden.
  const status = (state) => {
    send({ type: "capture-status", ...state });
    if (state.message) bubbles.showInactive();
  };
  return runFullPage({
    host: companionHost,
    status,
    attach: attachCapture,
    companionRequired: () => {
      send({ type: "companion-required" });
      bubbles.showInactive();
    },
  });
});
actions.add("companion-guide");
registerAction("companion-guide", async () => {
  try {
    await companionHost.openCompanionGuide();
  } catch {
    await externalShell.openExternal(
      "https://arthur031221.github.io/Glimpselet/install.html",
    );
  }
  return { ok: true };
});
if (
  !(
    process.env.BLINKLING_E2E === "1" &&
    process.env.BLINKLING_TEST_SESSION === "manual"
  )
)
  void session.connect().catch(() => {});
void features
  .resume()
  .catch(() => send({ type: "capture-status", state: "retrying" }));
const stopStacking = await keepAbove(() =>
  stackOrder({
    overlay,
    guides: features.overlay.window,
    bubbles,
    blink,
  }),
);
const poll = setInterval(() => {
  if (blink.isDestroyed() || !blink.isVisible()) return;

  const p = cursor.point();
  if (drag) {
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) >= 4)
      drag.active = true;
    const next = screen.getDisplayNearestPoint(p);
    if (next.id !== display.id) useDisplay(next);
    drag.velocity = (p.x - drag.lastX) / 0.016;
    drag.lastX = p.x;
    drag.anchor = {
      x: drag.origin.x + p.x - drag.start.x,
      y: drag.origin.y + p.y - drag.start.y,
    };
    broadcast();
  }
  const local = { x: p.x - display.bounds.x, y: p.y - display.bounds.y };
  const hit = regions.some((r) => contains(r, local));
  const overCard = composer?.isVisible() && contains(composer.getBounds(), p);
  const bubbleBounds = bubbles.getBounds();
  const overBubbles =
    bubbles.isVisible() &&
    bubbleRegions.some((r) =>
      contains(r, { x: p.x - bubbleBounds.x, y: p.y - bubbleBounds.y }),
    );
  if (!input && process.platform !== "win32")
    bubbles.setIgnoreMouseEvents(!overBubbles, { forward: true });
  const key = `${p.x},${p.y},${hit},${overCard},${overBubbles},${chatOpen}`;
  if (key !== previousCursor) {
    previousCursor = key;
    bubbles.webContents.send("blinkling:surface", {
      type: "hover",
      value: hit || !!overCard || overBubbles,
    });
    blink.webContents.send("blinkling:shell", {
      type: "cursor",
      point: local,
      hit: hit || !!overCard || overBubbles,
    });
    if (!input && !drag && ignoring === hit) {
      ignoring = !hit;
      blink.setIgnoreMouseEvents(ignoring, { forward: true });
    }
  }
}, 16);
let disposed = false;
app.on("before-quit", (event) => {
  quitting = true;
  if (disposed) return;
  event.preventDefault();
  features.dispose();
  Promise.allSettled([session.dispose(), companionHost.close()]).finally(() => {
    disposed = true;
    app.quit();
  });
});
app.on("will-quit", () => {
  clearInterval(poll);
  stopStacking();
  input?.dispose();
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => app.quit());
if (process.env.BLINKLING_E2E === "1")
  globalThis.blinklingTest = {
    blink,
    features,
    session,
    bubbles,
    send,
    get composer() {
      return composer;
    },
    snapshot,
    cursor: () => cursor.point(),
    pointer: cursor,
    cardBounds: () => cardBounds(display, position),
    attachCapture,
    openComposer,
    visualMasks,
    capture: () => captureScreen(display, windows()),
    overlay: async (drawings) => {
      overlay?.close();
      overlay = await createOverlay(display, drawings);
      return overlay.id;
    },
    displaysChanged,
    setDisplay: useDisplay,
    positionStore: store,
    registerAction,
  };
