import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  nativeTheme,
  shell as externalShell,
} from "electron";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { claimFocus, validHold } from "./card-hold.mjs";
import { createMachine } from "../interaction/machine.mjs";
import { validSeed } from "../composer/index.mjs";
import { timing } from "../shared/motion.mjs";
import { createSpinDetector } from "../character/spin.mjs";
import { validateAttachment } from "../composer/index.mjs";
import { reactionFor } from "../interaction/reactions.mjs";
import {
  APPEAR_FOR,
  CELEBRATE_FOR,
  DIZZY_FOR,
  EAT_FOR,
  FILE_FOR,
  LEAVE_FOR,
  SHRUG_FOR,
  TURN_FOR,
} from "../character/motions.mjs";
import { keepAbove, stackOrder } from "./x11-stacking.mjs";
import { nativeInput } from "./native-input.mjs";
import { cursorSource } from "./cursor.mjs";
import { boundsOf, contains } from "./geometry.mjs";
import {
  resolvePosition,
  snapPosition,
  reconcileDisplay,
  cardBounds,
  clampNudge,
  mouthOf,
} from "./placement.mjs";
import { PositionStore } from "./preferences.mjs";
import { validCommand, validRegions } from "./ipc.mjs";
import { createEscapeKeys } from "./escape-keys.mjs";
import { hidePointing } from "../pointing/elements.mjs";
import { createAnswerPointing } from "../pointing/answers.mjs";
import { dispatchAction, registerAction } from "./services.mjs";
import { captureScreen, screenImage, windowsOn } from "../capture/index.mjs";
import { createLocator } from "../locator/index.mjs";
import { createCaptureAccess } from "../locator/access.mjs";
import { createOverlay } from "../overlay/index.mjs";
import {
  installCaptureGuide,
  featureActions,
} from "../capture/integration.mjs";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { OwnedSession, SessionBridge } from "../session/index.mjs";
import { companionConnected } from "../capture/companion.mjs";
import { installPick } from "../pick/install.mjs";
import { createOnce, fileStore } from "../pick/once.mjs";
import { installSettings } from "../settings/install.mjs";
import { installWelcome } from "../welcome/install.mjs";
import { createSettingsStore } from "../settings/store.mjs";
import { installPrivacy } from "../privacy/index.mjs";
import { systemLocale } from "../shared/i18n.mjs";
import { createGuideOffer, SAVE_ACTION } from "../guides/offer.mjs";
import { armHardQuitDeadline, armQuitWatchdog } from "./quit.mjs";
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
// Every surface speaks this one language, resolved here and sent out (N3.10).
const locale = systemLocale({
  app,
  chosen: createSettingsStore(
    join(app.getPath("userData"), "settings.json"),
  ).get().language,
});
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
  // What the page of a card that is still loading is owed, and whether it has
  // been told a new chat began while it did not exist.
  cardLoaded = false,
  heldEvents = [],
  freshChat = false,
  outsideWasDown = false,
  typing = false,
  overlay = null,
  regions = [],
  blinkRegions = [],
  // Where the peek was when the pointer pulled Blink out: the pointer stays
  // "on Blink" there while Blink steps out from under it.
  rim = [],
  menuRegions = [],
  drag = null,
  pinned = false,
  chatOpen = false,
  miniOpen = false,
  autoExplain = false,
  quitting = false;
// One owner for what Blink is doing and every retreat and close deadline.
const machine = createMachine({ now: () => performance.now() });
let previousCursor = "",
  previousFocused = null,
  ignoring = true;
// A quit asked for while Blink is still starting would otherwise be held back
// by the windows' close handlers, which only let go once `quitting` is set, and
// nothing would end it. This listener exists from the start; the fuller one
// near the end of the file disposes what has been built by then.
app.on("before-quit", () => {
  if (quitting) return;
  quitting = true;
  armQuitWatchdog(() => app.exit(0));
  // Quitting a moment after launch has stalled the main thread inside a native
  // call, where no timer runs; the deadline on a worker thread still does.
  armHardQuitDeadline();
});
// Hints shown exactly once, remembered across restarts (N2.1 first-use labels).
const uiOnce = createOnce(
  fileStore(join(app.getPath("userData"), "ui-once.json")),
);
const input = await nativeInput();
const cursor = cursorSource({
  query: input?.pointer,
  fallback: () => screen.getCursorScreenPoint(),
  toDip: (point) => screen.screenToDipPoint(point),
});
// The menu has four bubbles (N2.1) and Close; the capture, guide and auto explain
// buttons reach the feature actions behind them.
const actions = new Set([
  "guide",
  "auto-explain",
  "settings",
  "quit",
  ...featureActions,
]);
const escapeKeys = createEscapeKeys({ shortcuts: globalShortcut });
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
    title: "Blinkling",
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
  // Every window is "Blinkling", whatever its page calls itself (L1).
  win.on("page-title-updated", (event) => event.preventDefault());
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
  [composer, overlay, blink].filter((w) => w && !w.isDestroyed());
// Settings and the welcome are Blinkling's own windows too: kept out of captures
// and masked while visible, but without the privileges of the Blink windows.
const extraWindows = [];
const surfaces = () => [
  ...windows(),
  ...extraWindows.filter((w) => !w.isDestroyed()),
];
/** The card's place: beside Blink, moved by what the reader nudged on this edge. */
const cardAt = (at = position) =>
  cardBounds(display, at, store.nudge(`card:${at.edge}`));
const snapshot = () => ({
  display: {
    id: String(display.id),
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
  },
  position,
  mouth: mouthOf(position.reveal),
  nudge: store.nudge(`card:${position.edge}`),
  drag: drag?.active
    ? {
        x: drag.anchor.x - display.bounds.x,
        y: drag.anchor.y - display.bounds.y,
        velocity: drag.velocity,
      }
    : null,
  pinned,
  chatOpen,
  miniOpen,
  interaction: machine.read(),
  fanLabelsSeen: uiOnce.seen("fan-labels"),
  chatFocused: !!composer && !composer.isDestroyed() && composer.isFocused(),
  autoExplain,
  theme: nativeTheme.shouldUseDarkColors ? "dark" : "light",
  locale,
});
/** A one-off motion for the renderer to play. Blink is pulled out for as long as
 * it lasts, so it is always seen. */
const PLAYS = {
  appear: APPEAR_FOR,
  eat: EAT_FOR,
  file: FILE_FOR,
  celebrate: CELEBRATE_FOR,
  shrug: SHRUG_FOR,
  turn: TURN_FOR,
  dizzy: DIZZY_FOR,
  leave: LEAVE_FOR,
};
function motion(name, extra = {}) {
  if (quitting && name !== "leave") return;
  if (name in PLAYS) flow((m) => m.showFor(PLAYS[name] * 1000));
  if (!blink.isDestroyed())
    blink.webContents.send("blinkling:shell", {
      type: "motion",
      name,
      ...extra,
    });
}
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
  const win = new BrowserWindow(windowOptions(cardAt(), true));
  composer = win;
  secure(win);
  // Esc in the focused card closes the top layer, which is the card itself
  // unless the capture overlay sits above it.
  win.webContents.on("before-input-event", (event, key) => {
    if (key.type !== "keyDown" || key.key !== "Escape") return;
    event.preventDefault();
    escapeKeys.press();
  });
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      flow((m) => m.close());
    }
  });
  win.on("focus", () => {
    escapeKeys.set("mini", () => flow((m) => m.escape()));
    shapeComposer();
    flow((m) => m.composer({ focus: true }));
  });
  // A window manager handing the keyboard away while the card settles in is
  // not the reader leaving it; the claim below takes it back.
  win.on("blur", () =>
    flow((m) =>
      Date.now() < claimUntil ? m.composer({ focus: false }) : m.blurred(),
    ),
  );
  let timer;
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(Error("Composer startup timed out")),
      timing.composerStartup,
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
    cardLoaded = true;
    // What Blink said while the page was loading reaches it now.
    for (const held of heldEvents.splice(0))
      win.webContents.send("blinkling:event", held);
    if (freshChat) {
      freshChat = false;
      tellCard({ type: "new-chat" });
    }
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
  if (focus) claimUntil = Date.now() + timing.composerStartup;
  const win = await ensureComposer();
  if (!chatOpen) cardBus.emit("revive");
  chatOpen = true;
  // Esc belongs to the card only once the reader is in it: a card that opened
  // by itself for an answer or a guide must not stand above the guide's Esc.
  if (focus) escapeKeys.set("mini", () => flow((m) => m.escape()));
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
/** A window manager may hand the keyboard to another window just after the
 * card opens (the window that closed, a focus revert). For a short settle
 * period, ask again whenever the card does not have it; after that a click
 * elsewhere is the user's decision and wins. */
let cancelClaim = null;
let claimUntil = 0;
function claimKeyboard(win, settle = 600) {
  cancelClaim?.();
  claimUntil = Date.now() + settle + 100;
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
/** Run a change on the machine, then act on whatever it decided. */
function flow(change) {
  const result = change?.(machine);
  act(machine.take());
  return result;
}
function act(effects) {
  for (const effect of effects) {
    if (effect.type === "open-chat") void openComposer({ focus: effect.focus });
    else if (effect.type === "close-chat") closeComposer();
    else if (effect.type === "out") rim = blinkRegions;
    else if (effect.type === "retreat") rim = [];
    else if (effect.type === "answer-done" || effect.type === "answer-failed") {
      const name = reactionFor({
        words: effect.words,
        failed: effect.type === "answer-failed",
      });
      if (name) motion(name);
    } else if (effect.type === "open-menu" && !effect.hover)
      closeComposer(false);
    else if (effect.type === "pick-up" && drag) {
      rim = [];
      drag.active = true;
    }
  }
  const key = JSON.stringify(machine.read());
  if (key !== interactionKey) {
    interactionKey = key;
    broadcast();
  }
}
let interactionKey = "";
function closeComposer(restore = true) {
  cancelClaim?.();
  const focused = composer?.isFocused();
  if (chatOpen) cardBus.emit("fade");
  chatOpen = false;
  pinned = false;
  escapeKeys.set("mini", null);
  composer?.hide();
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
/** What the card needs to know that only the shell sees. */
const tellCard = (message) => {
  if (cardLoaded && composer && !composer.isDestroyed())
    composer.webContents.send("blinkling:surface", message);
};
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
  followBlink();
  broadcast();
}
/** The card goes where Blink goes. Called on every move of Blink, on drop and
 * on every display change. */
let placedAt = "";
// The quick box goes with Blink too; it exists once the pick feature is up.
let followBlink = () => {};
function placeCard(at = position) {
  const bounds = cardAt(at);
  const key = JSON.stringify(bounds);
  if (key === placedAt) return;
  placedAt = key;
  composer?.setBounds(bounds);
  shapeComposer();
}
/** Both ways a carried Blink is put down end here. A drop that followed two
 * loops leaves it dizzy. Returns whether it had been picked up. */
function endDrag() {
  const done = drag;
  drag = null;
  if (done?.whirled) motion("dizzy");
  return Boolean(done?.active);
}
function displaysChanged() {
  const next = reconcileDisplay(screen.getAllDisplays(), display.id);
  endDrag();
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
ipcMain.on("blinkling:regions", (event, value, parts = {}) => {
  if (
    event.sender !== blink.webContents ||
    !trusted(event) ||
    !validRegions(value, blink.getBounds()) ||
    !(
      parts?.blink === undefined || validRegions(parts.blink, blink.getBounds())
    ) ||
    !(parts?.menu === undefined || validRegions(parts.menu, blink.getBounds()))
  )
    return;
  regions = value;
  blinkRegions = parts.blink ?? [];
  menuRegions = parts.menu ?? [];
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
        spin: createSpinDetector(),
        whirled: false,
      };
      flow((m) => m.press(p));
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
      // The machine tells a click from a drop: a short press is a click.
      flow((m) => m.release());
      const saved = drag.active ? snapPosition(display, drag.anchor) : null;
      const before = position.edge;
      if (saved) position = resolvePosition(display, saved);
      endDrag();
      if (saved && position.edge !== before)
        motion("turn", {
          dir: position.edge === "right" || position.edge === "bottom" ? 1 : -1,
        });
      if (input) input.setRegions(blink, regions, display.scaleFactor);
      else if (process.platform === "win32") blink.setShape(regions);
      if (saved) await store.save(display.id, saved);
      placeCard();
      followBlink();
    }
  } else if (command.type === "pin") {
    pinned = command.value;
    flow((m) => m.pin(pinned));
  } else if (command.type === "close-chat") flow((m) => m.close());
  else if (command.type === "grumble") {
    if (!fromBlink) throw new Error("Invalid shell gesture");
    flow((m) => m.grumble(command.value));
  } else if (command.type === "click") {
    if (!fromBlink) throw new Error("Invalid shell gesture");
    flow((m) => m.click());
  } else if (command.type === "fan-labels-seen") {
    if (!fromBlink) throw new Error("Invalid fan label report");
    uiOnce.take("fan-labels");
  }
  broadcast();
  return snapshot();
});
ipcMain.handle("blinkling:action", async (event, action) => {
  if (!trusted(event) || !actions.has(action))
    throw new Error("Invalid desktop action");
  if (action === "auto-explain") {
    const result = await dispatchAction(action, {
      display,
      windows: surfaces(),
      enabled: !autoExplain,
    });
    if (result.ok) {
      autoExplain = !autoExplain;
      broadcast();
    }
    return result;
  }
  return dispatchAction(action, { display, windows: surfaces(), openComposer });
});
const send = (event) => {
  const shown = hidePointing(event);
  for (const win of windows()) {
    if (win === composer && !cardLoaded) {
      // The card's page is still loading: keep what matters for it.
      if (["guide", "blink-say", "blink-offer"].includes(event.type))
        heldEvents.push(shown);
      if (heldEvents.length > 50) heldEvents.shift();
    } else win.webContents.send("blinkling:event", shown);
  }
  // What Blink says on its own opens the card, and the reading rule closes it.
  if (event.type === "blink-say" || event.type === "blink-offer")
    flow((m) => m.notice());
  else if (event.type === "guide")
    flow((m) => {
      m.guide(event.phase !== "dismissed" && event.phase !== "error");
      if (event.phase === "error") m.notice();
    });
};
const fakeClaude =
  process.env.BLINKLING_E2E === "1" && process.env.BLINKLING_LIVE !== "1"
    ? fileURLToPath(
        new URL("../session/e2e/fake-claude.fixture.mjs", import.meta.url),
      )
    : null;
const session = new SessionBridge({
  userDataDir: app.getPath("userData"),
  cwd:
    process.env.BLINKLING_CWD ??
    (process.env.BLINKLING_E2E === "1" && process.env.BLINKLING_LIVE !== "1"
      ? app.getPath("userData")
      : process.cwd()),
  // The e2e fixture is a script, which Windows cannot run as a program, so
  // tests run it through node on every platform.
  executable: process.env.BLINKLING_CLAUDE ?? (fakeClaude ? "node" : "claude"),
  ...(fakeClaude && !process.env.BLINKLING_CLAUDE
    ? {
        transportFactory: () =>
          new OwnedSession({ executableArgs: [fakeClaude] }),
      }
    : {}),
});
session.subscribe(send, { visible: true });
// Pointing, the pick layer and the privacy guard share one locator. It is
// reached through this stand-in so an e2e run can swap in recorded elements
// (blinklingTest.locator.set); until the real one exists nothing is found.
let locatorImpl = { elements: async () => [], windowAt: () => null };
const locator = new Proxy(
  {},
  {
    get: (_, name) =>
      typeof locatorImpl[name] === "function"
        ? locatorImpl[name].bind(locatorImpl)
        : undefined,
  },
);
// The card opening and closing, as events the marks listen to: they fade with
// the answer they point out.
const cardBus = new EventEmitter();
// The finished guide `{title, steps, explanation, shots}` for the saver.
const guideEvents = new EventEmitter();
const blinkPoint = () => ({
  x: position.reveal.x + display.bounds.x,
  y: position.reveal.y + display.bounds.y,
});
const mouthPoint = () => mouthOf(blinkPoint());
/** While the pick layer is up Blink's eyes follow the cursor. */
let pickingOn = false;
const tellPicking = (on) => {
  if (on !== pickingOn) {
    pickingOn = on;
    flow((m) => m.capture(on));
  }
  if (!blink.isDestroyed())
    blink.webContents.send("blinkling:shell", { type: "picking", on });
};
// A question about the screen carries the element list; its answer's
// `[[n:id|label]]` references are drawn as marks (M3).
const answers = createAnswerPointing({
  pointing: {
    clear: (reason) => features?.pointing.clear(reason),
    instructions: (window) => features.pointing.instructions(window),
    show: (refs, options) => features.pointing.show(refs, options),
  },
  display: () => display,
  window: async () => (await locator.windowAt?.(blinkPoint())) ?? null,
});
const referenceHovered = [];
/** A click on a mark brings the card up at the sentence that cites it. */
function revealReference(ref) {
  flow((m) => m.notice());
  void openComposer({ focus: false }).then(() =>
    composer.webContents.send("blinkling:mark-click", { ref }),
  );
}
// An answer opens the card by itself and closes it by the reading rule.
let answerWords = 0;
session.subscribe(
  (event) => {
    if (event.type === "delta") {
      answerWords += String(event.text ?? "")
        .split(/\s+/)
        .filter(Boolean).length;
      if (!machine.read().streaming) flow((m) => m.answerStart());
    } else if (event.type === "done") {
      flow((m) => m.answerEnd(answerWords));
      answerWords = 0;
    }
  },
  { visible: false },
);
session.subscribe(
  (event) =>
    answers
      .event(event)
      .then((drawn) => {
        if (drawn)
          escapeKeys.set("marks", () => features.pointing.clear("esc"));
      })
      .catch(() => {}),
  { visible: false },
);
const requireView = (event) => {
  if (!trusted(event) || event.sender !== composer?.webContents)
    throw new Error("Invalid conversation sender");
};
ipcMain.handle("blinkling:configuration", (event) => {
  requireView(event);
  return {
    selection: session.state?.selection,
    theme: snapshot().theme,
    locale,
  };
});
ipcMain.on("blinkling:subscribe", (event) => {
  if (!trusted(event)) return;
  // Only history is replayed here; the renderer must not treat it as new.
  const unsubscribe = session.subscribe(
    (value) =>
      event.sender.send("blinkling:event", {
        ...hidePointing(value),
        replay: true,
      }),
    { visible: true },
  );
  unsubscribe();
});
ipcMain.handle("blinkling:drop-files", async (event, attachments) => {
  if (event.sender !== blink.webContents)
    throw new Error("Invalid drop sender");
  if (
    !Array.isArray(attachments) ||
    !attachments.length ||
    attachments.length > 8
  )
    throw new Error("Invalid drop");
  const valid = attachments.map(validateAttachment);
  motion("file");
  await openComposer();
  claimKeyboard(composer);
  for (const image of valid)
    composer.webContents.send("blinkling:capture", { image });
});
ipcMain.handle("blinkling:send", async (event, turn) => {
  requireView(event);
  // Blink shows its thinking face the moment a message goes out (N4), and
  // the card shows the dots; a question with a picture says it is looking.
  send({
    type: "sending",
    seeing: Boolean(
      turn?.attachments?.some?.((a) => a?.mediaType?.startsWith("image/")),
    ),
  });
  answerWords = 0;
  flow((m) => m.answerStart());
  try {
    await session.send(await answers.ask(turn));
  } catch (error) {
    flow((m) => m.answerFailed());
    throw error;
  }
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
/** The reader drags the card by its header: it moves up to 120 px from where
 * it opens, a drag in progress is held in memory, and the final place (or a
 * reset by double click) is remembered for this edge. */
ipcMain.on("blinkling:nudge", (event, message) => {
  if (!trusted(event) || event.sender !== composer?.webContents) return;
  const key = `card:${position.edge}`;
  const next = message?.reset ? { x: 0, y: 0 } : clampNudge(message);
  store.nudges[key] = next;
  placeCard();
  broadcast();
  if (message?.commit || message?.reset) void store.saveNudge(key, next);
});
ipcMain.on("blinkling:typing", (event, value) => {
  if (
    !trusted(event) ||
    event.sender !== composer?.webContents ||
    typeof value !== "boolean"
  )
    return;
  typing = value;
  flow((m) => m.composer({ text: value }));
});
/** What the card tells the machine it is doing: reading by scroll or
 * selection, an IME composition, the image viewer. Nothing else crosses. */
ipcMain.on("blinkling:engage", (event, value) => {
  if (!trusted(event) || event.sender !== composer?.webContents) return;
  if (value?.kind === "scroll") flow((m) => m.scrolled());
  else if (value?.kind === "select") flow((m) => m.selected());
  else if (value?.kind === "ime" && typeof value.value === "boolean")
    flow((m) => m.composer({ ime: value.value }));
  else if (value?.kind === "viewer" && typeof value.value === "boolean")
    flow((m) => m.viewer(value.value));
});
ipcMain.on("blinkling:hold", (event, value) => {
  const hold = validHold(value);
  if (!trusted(event) || event.sender !== composer?.webContents || !hold)
    return;
  flow((m) => m.panels(hold.chips || hold.dialog ? 1 : 0));
});
/** The pointer on a cited phrase in the card pulses its mark on the screen. */
ipcMain.on("blinkling:reference-hover", (event, value) => {
  const ref = value?.ref;
  if (
    !trusted(event) ||
    event.sender !== composer?.webContents ||
    !(ref === null || (typeof ref === "string" && ref.length <= 200))
  )
    return;
  features?.pointing.pulse(features.pointing.numberOf(ref));
  referenceHovered.push(ref);
  referenceHovered.splice(0, referenceHovered.length - 20);
});
// Tests reach Blink as soon as the window exists; the rest is added below.
if (process.env.BLINKLING_E2E === "1")
  globalThis.blinklingTest = {
    blink,
    get composer() {
      return composer;
    },
  };
await blink.loadFile(
  fileURLToPath(new URL("../renderer/index.html", import.meta.url)),
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
// Opening Blink again while it runs brings it forward instead of doing nothing.
app.on("second-instance", () => {
  if (!blink.isDestroyed()) blink.showInactive();
});
const visualMasks = () =>
  surfaces()
    .filter((w) => w.isVisible())
    .flatMap((w) => {
      const b = w.getBounds();
      const shape =
        w === blink
          ? regions
          : [{ x: 0, y: 0, width: b.width, height: b.height }];
      return shape.map((r) => ({
        ...r,
        x: r.x + b.x - display.bounds.x,
        y: r.y + b.y - display.bounds.y,
      }));
    });
// The guide's overlay has no focused window, so Left and Right are global
// keys that exist only while a guide is up.
let arrowsOn = false;
function guideArrows(wanted) {
  if (wanted === arrowsOn) return;
  arrowsOn = wanted;
  const keys = { Left: "guide-back", Right: "guide-next" };
  for (const [key, action] of Object.entries(keys))
    if (wanted) globalShortcut.register(key, () => features.handle(action));
    else globalShortcut.unregister(key);
}
// Every capture, from the region selector, the hotkey or a pick, flies into
// Blink and opens the mini composer.
const attachCapture = async (taken) => pick.deliver(taken);
features = installCaptureGuide({
  blink,
  windows: surfaces,
  session,
  masks: visualMasks,
  busy: () => typing || !!session.active,
  onCapture: attachCapture,
  locator,
  card: cardBus,
  cursor: () => cursor.point(),
  onEnd: (finished) => guideEvents.emit("end", finished),
  onGuide: (guide) => {
    escapeKeys.set(
      "guide",
      guide.phase === "dismissed"
        ? null
        : () => features.handle("guide-dismiss"),
    );
    send({ type: "guide", ...guide });
    guideArrows(["step", "overview", "finished"].includes(guide.phase));
  },
  onState: (state) => send({ type: "capture-status", ...state }),
  fullPage: (signal, progress) => companionHost.fullPage(signal, progress),
  companion: () => companionConnected(companionHost),
});
for (const action of featureActions)
  registerAction(action, () => features.handle(action));
// Marks are click-through, so a click on one arrives from the overlay through
// pointing. In a guide it focuses that step; on an answer it scrolls the
// card to the sentence that cites it.
features.overlay.on("dismissed", () => escapeKeys.set("marks", null));
features.pointing.onMarkClick((n) => {
  if (features.guide.guide) features.guide.focusMark(n);
  else {
    const ref = answers.refOf(n);
    if (ref) revealReference(ref);
  }
});
actions.add("companion-guide");
async function openCompanionGuide() {
  try {
    await companionHost.openCompanionGuide();
  } catch {
    await externalShell.openExternal(
      "https://arthur031221.github.io/Blinkling/install/",
    );
  }
  return { ok: true };
}
registerAction("companion-guide", openCompanionGuide);
// The end of a guide offers one 儲存導覽 bubble (m-pointing calls offerSave);
// clicking it writes Documents/Blinkling Guides and reveals the folder.
const revealedGuides = [];
const guideOffer = createGuideOffer({
  send,
  languages: [locale],
  // The e2e run must not open a file manager; it records the folder instead.
  ...(process.env.BLINKLING_E2E === "1"
    ? { reveal: (folder) => revealedGuides.push(folder) }
    : {}),
});
actions.add(SAVE_ACTION);
registerAction(SAVE_ACTION, () => guideOffer.save());
app.once("will-quit", () => guideOffer.dispose());
const { systemPreferences, nativeImage, dialog, desktopCapturer } =
  await import("electron");
// One locator for the whole shell: pick, capture and pointing read the same
// cache, so a second look at a window costs nothing.
const realLocator = createLocator({
  companion: () => companionConnected(companionHost),
  host: companionHost,
  platform: process.platform,
  capture: createCaptureAccess({ screen, windowsOn, grab: screenImage }),
});
locatorImpl = realLocator;
const pick = await installPick({
  electron: {
    BrowserWindow,
    screen,
    ipcMain,
    nativeImage,
    nativeTheme,
    systemPreferences,
    dialog,
  },
  shell: {
    userDataDir: app.getPath("userData"),
    locale,
    locator,
    windowOptions,
    secure,
    windows: surfaces,
    input,
    cursor: () => cursor.point(),
    blinkPoint,
    mouthPoint,
    workArea: () => display.workArea,
    session,
    captureScreen,
    newChat: () => {
      if (cardLoaded) tellCard({ type: "new-chat" });
      else freshChat = true;
    },
    caught: () => motion("eat"),
    picking: tellPicking,
    miniChanged: (open) => {
      miniOpen = open;
      broadcast();
    },
    autoExplain: {
      get: () => autoExplain,
      set: async (enabled) => {
        if (enabled === autoExplain) return;
        const result = await dispatchAction("auto-explain", {
          display,
          windows: surfaces(),
          enabled,
        });
        if (result.ok) {
          autoExplain = enabled;
          broadcast();
        }
      },
    },
    composer: {
      open: () => openComposer(),
      attach: async (attachment) => {
        await openComposer();
        claimKeyboard(composer);
        const capture = { image: attachment };
        composer.webContents.send("blinkling:capture", capture);
        send({ type: "capture", capture });
      },
    },
  },
});
followBlink = (point) => pick.followBlink(point);
// Privacy looks through whichever locator pick has now, so one that plugs in
// later is used by both; its verdicts come back to pick as the open guard.
const pickLocator = {
  focus: () => pick.locator().focus(),
  windowAt: (point) => pick.locator().windowAt?.(point),
};
// Settings and the welcome are two hidden windows made now and reused (N6.4).
// Settings opens from the menu bubble; the welcome opens on the first start and
// from Settings.
const secondary = {
  userDataDir: app.getPath("userData"),
  // The same locale the fan's own bubbles use (the only system ask is i18n).
  locales: [locale],
  windowOptions,
  secure,
  input,
  workArea: () => display.workArea,
  openExternal: (url) => externalShell.openExternal(url),
};
const welcome = installWelcome({
  electron: { BrowserWindow, ipcMain, systemPreferences, desktopCapturer },
  shell: secondary,
  pickKey: { get: () => pick.pickKey() },
});
const settings = installSettings({
  electron: { BrowserWindow, ipcMain },
  shell: { ...secondary, version: app.getVersion() },
  hotkey: {
    get: () => features.hotkey,
    set: (accelerator) => features.setHotkey(accelerator),
  },
  pickKey: {
    get: () => pick.pickKey(),
    set: (name) => pick.setPickKey(name),
  },
  host: {
    welcome: () => {
      settings.close();
      void welcome.open();
    },
    guide: () => void openCompanionGuide(),
    // The language is read at start, so a new one restarts Blink.
    languageChanged: () => {
      app.relaunch();
      app.quit();
    },
  },
});
extraWindows.push(welcome.test.win, settings.test.win);
// Close ends Blinkling, as the end of its session does.
registerAction("quit", async () => {
  setImmediate(() => app.quit());
  return { ok: true };
});
registerAction("settings", async () => {
  await settings.open();
  return { ok: true };
});
const privacy = installPrivacy({
  session,
  features,
  locator: pickLocator,
  send,
  languages: [locale],
  renderer: (listener) => {
    blink.webContents.on("did-finish-load", listener);
    return () => {
      if (!blink.isDestroyed())
        blink.webContents.off("did-finish-load", listener);
    };
  },
});
pick.setGuard(privacy.openGuard);
app.once("will-quit", () => privacy.dispose());
if (
  !(
    process.env.BLINKLING_E2E === "1" &&
    process.env.BLINKLING_TEST_SESSION === "manual"
  )
)
  void session.connect().catch((error) => {
    console.error(
      `Blinkling: the session did not start: ${error?.message ?? error}`,
    );
  });
// The first start opens the welcome; end-to-end runs skip it unless asked.
if (process.env.BLINKLING_E2E !== "1" || process.env.BLINKLING_WELCOME === "1")
  void welcome.openFirstTime();
void features
  .resume()
  .catch(() => send({ type: "capture-status", state: "retrying" }));
// Blink is on screen; the card's page loads behind it so it opens at once.
void ensureComposer().catch(() => {});
const stopStacking = await keepAbove(() =>
  stackOrder({
    overlay,
    guides: features.overlay.window,
    card: composer,
    blink,
  }),
);
/** Whether a screen point is on anything Blinkling draws and takes clicks on. */
function over(p) {
  const local = { x: p.x - display.bounds.x, y: p.y - display.bounds.y };
  if (regions.some((r) => contains(r, local))) return true;
  return [composer, ...extraWindows].some(
    (w) => w && !w.isDestroyed() && w.isVisible() && contains(w.getBounds(), p),
  );
}
const poll = setInterval(() => {
  if (blink.isDestroyed() || !blink.isVisible()) return;

  const p = cursor.point();
  if (drag) {
    flow((m) => m.pointer(p));
    const next = screen.getDisplayNearestPoint(p);
    if (next.id !== display.id) useDisplay(next);
    if (
      drag.active &&
      !drag.whirled &&
      drag.spin.add(p, performance.now()) >= 2
    ) {
      // Two loops while held: Blink is spun round in the air, dizzy on the drop.
      drag.whirled = true;
      motion("whirl");
    }
    drag.velocity = (p.x - drag.lastX) / 0.016;
    drag.lastX = p.x;
    drag.anchor = {
      x: drag.origin.x + p.x - drag.start.x,
      y: drag.origin.y + p.y - drag.start.y,
    };
    if (drag.active) {
      placeCard(resolvePosition(display, snapPosition(display, drag.anchor)));
      followBlink(drag.anchor);
    }
    broadcast();
  }
  const local = { x: p.x - display.bounds.x, y: p.y - display.bounds.y };
  const hit = regions.some((r) => contains(r, local));
  const onBlink =
    (blinkRegions.length ? blinkRegions : regions).some((r) =>
      contains(r, local),
    ) ||
    (machine.read().out && rim.some((r) => contains(r, local)));
  if (!drag) {
    const card = composer?.isVisible() ? composer.getBounds() : null;
    machine.geometry({
      blink: boundsOf(blinkRegions, display.bounds),
      card: card && {
        x: card.x + 12,
        y: card.y + 12,
        width: card.width - 24,
        height: card.height - 24,
      },
      menu: boundsOf(menuRegions, display.bounds),
    });
    flow((m) => {
      m.pointer(p, performance.now(), onBlink);
    });
  }
  // tick() hands back what it decided (a long press picks Blink up).
  act(machine.tick());
  const overCard = composer?.isVisible() && contains(composer.getBounds(), p);
  // A press anywhere that is not Blinkling's own ends an answered card; the
  // native pointer reports the button, and a lost focus covers the rest.
  const down = cursor.pressed();
  if (down !== null) {
    if (down && !outsideWasDown && !drag && !miniOpen && !over(p))
      flow((m) => m.outside());
    outsideWasDown = down;
  }
  const key = `${p.x},${p.y},${hit},${overCard},${chatOpen}`;
  if (key !== previousCursor) {
    previousCursor = key;
    blink.webContents.send("blinkling:shell", {
      type: "cursor",
      point: local,
      hit: hit || !!overCard,
      blink: onBlink,
    });
    if (!input && !drag && ignoring === hit) {
      ignoring = !hit;
      blink.setIgnoreMouseEvents(ignoring, { forward: true });
    }
  }
}, timing.cursorPoll);
// End-to-end runs keep Blink still unless they ask for the entrance and exit.
const showsMotions =
  process.env.BLINKLING_E2E !== "1" || process.env.BLINKLING_MOTIONS === "1";
if (showsMotions)
  setTimeout(() => motion("appear"), timing.appearLead).unref?.();
let disposed = false;
app.on("before-quit", (event) => {
  if (disposed) return;
  event.preventDefault();
  // The watchdog armed at the first request covers a stuck session or helper
  // here and a quit that stalls after disposal.
  features.dispose();
  // Blink waves goodbye while the rest shuts down.
  const leaving = showsMotions && blink.isVisible();
  if (leaving) motion("leave");
  Promise.allSettled([
    session.dispose(),
    companionHost.close(),
    realLocator.close(),
    leaving
      ? new Promise((done) => setTimeout(done, LEAVE_FOR * 1000))
      : undefined,
  ]).finally(() => {
    disposed = true;
    app.quit();
  });
});
app.on("will-quit", () => {
  clearInterval(poll);
  stopStacking();
  input?.dispose();
  pick.dispose();
  settings.dispose();
  welcome.dispose();
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => app.quit());
if (process.env.BLINKLING_E2E === "1")
  Object.assign(globalThis.blinklingTest, {
    features,
    session,
    picking: tellPicking,
    send,
    guideOffer,
    revealedGuides,
    snapshot,
    cursor: () => cursor.point(),
    pointer: cursor,
    cardBounds: () => cardAt(),
    attachCapture,
    openComposer,
    visualMasks,
    capture: () => captureScreen(display, surfaces()),
    overlay: async (drawings) => {
      overlay?.close();
      overlay = await createOverlay(display, drawings);
      return overlay.id;
    },
    displaysChanged,
    setDisplay: useDisplay,
    positionStore: store,
    registerAction,
    guideEvents,
    locator: new Proxy(locator, {
      get: (target, name) =>
        name === "set" ? (next) => (locatorImpl = next) : target[name],
    }),
    settings,
    welcome,
    uiOnce,
  });
if (globalThis.blinklingTest)
  globalThis.blinklingTest.nBlinkMenuFaces = {
    escapeKeys,
    /** Opens the card through the machine, so the close rules apply to it. */
    openCard: (focus = false) => {
      if (machine.read().card) return openComposer({ focus });
      flow((m) => {
        if (focus) m.click();
        else {
          m.answerStart();
          m.answerEnd(0);
        }
      });
    },
    interaction: () => machine.read(),
    titles: () => BrowserWindow.getAllWindows().map((w) => w.getTitle()),
  };
/** Card hooks live under blinklingTest.deck so the literal above stays shared. */
function installDeckTest() {
  if (process.env.BLINKLING_E2E !== "1") return;
  globalThis.blinklingTest.deck = {
    markClick: (ref) => revealReference(ref),
    hovered: referenceHovered,
  };
}
installDeckTest();
