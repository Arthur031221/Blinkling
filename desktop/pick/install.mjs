import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createLayers } from "./layer-window.mjs";
import { createRaiser } from "./raise.mjs";
import { createPickKeys } from "./keys.mjs";
import { createKeySource, loadUiohook } from "./keys-uiohook.mjs";
import { createHelperKeySource, keytapPath } from "./keys-helper.mjs";
import { spawn as spawnProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPickController } from "./controller.mjs";
import { createPicker } from "./picker.mjs";
import { createGrouper } from "./group.mjs";
import { createCropper } from "./crop.mjs";
import { createOnce, fileStore } from "./once.mjs";
import { createPickHint } from "./teach.mjs";
import { t as pickText } from "./strings.mjs";
import { createQuick } from "./quick.mjs";
import { live, pickLocale } from "../shared/i18n.mjs";
import { exposeTestHook } from "../shared/test-hooks.mjs";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));

/** Until the window locator and secure-field guard land, a pick sees no element
 * data: every click falls through to the screen under it and nothing is locked.
 * That is exactly the exposure of the existing screenshot capture. */
export const windowLocator = Object.freeze({
  locate: async () => null,
  parent: async () => null,
  selectionAt: async () => null,
  textIn: async () => "",
  focus: async () => ({ secure: false }),
  windowAt: async () => null,
});
/** The stand-in until the shell hands over the privacy guard (`setGuard`). */
export const openGuard = Object.freeze({ allowed: () => true });

/** The layer page talks to the main process through its own small preload, not the shell's. */
const layerOptions = (options) => ({
  ...options,
  webPreferences: {
    ...options.webPreferences,
    preload: here("layer-preload.cjs"),
  },
});

const PICK_KEY_NAMES = ["control", "option"];
const RETRY_MS = 2000;

function pickKeySetting(file, env) {
  const fromEnv = env.BLINKLING_PICK_KEY;
  if (PICK_KEY_NAMES.includes(fromEnv)) return fromEnv;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")).pickKey;
    if (PICK_KEY_NAMES.includes(saved)) return saved;
  } catch {
    // No saved setting yet, or an unreadable one: the default key.
  }
  return "control";
}

/** Wires the pick (M4–M7, N1–N3): the global pick key, one layer window per
 * display, the controller, the quick question in the card's composer. The
 * shell calls this once and routes every capture through the returned `deliver`.
 *
 * electron: {BrowserWindow, screen, ipcMain, nativeImage, systemPreferences?, dialog?}
 * shell: {userDataDir, windowOptions(bounds, focusable), secure(win), windows(), viewImage?(image),
 *   input, blinkPoint(), workArea(), session, autoExplain:{get, set},
 *   composer:{open, attach}, captureScreen(display, windows), newChat?, caught? (Blink bounces when the flight lands),
 *   quickShow?(event) (tells the card the quick question changed),
 *   locator?, guard?, env?, platform?} */
export async function installPick({
  electron,
  shell,
  loadKeys = loadUiohook,
  spawn = spawnProcess,
  setTimer,
  clearTimer,
  now,
  onError = () => {},
}) {
  const {
    BrowserWindow,
    screen,
    ipcMain,
    nativeImage,
    systemPreferences,
    dialog,
  } = electron;
  const env = shell.env ?? process.env;
  // The shell resolves the system language once; the variable is for a bare run.
  // `shell.locale` may be a function: a language chosen in settings applies at once.
  const locale = () => pickLocale(live(shell.locale) ?? env.BLINKLING_LOCALE);
  const timers = setTimer ? { setTimer, clearTimer } : {};

  const once = createOnce(fileStore(join(shell.userDataDir, "pick-once.json")));
  const hint = createPickHint({
    once,
    t: (key, vars) => pickText(locale())(key, vars),
  });
  const settingsFile = join(shell.userDataDir, "pick-settings.json");
  let pickKey = pickKeySetting(settingsFile, env);

  let controller = null;
  const raiser = createRaiser();
  const layer = createLayers({
    BrowserWindow,
    screen,
    ipcMain,
    options: layerOptions(
      shell.windowOptions({ x: 0, y: 0, width: 1, height: 1 }, false),
    ),
    page: here("layer.html"),
    secure: (win) => {
      win.webContents.setBackgroundThrottling?.(false);
      shell.secure(win);
    },
    onPointer: (event) => void controller?.input(event).catch(onError),
    raise: (windows) => raiser.raise(windows),
    ...timers,
  });
  // The first hold teaches the gesture once, near the cursor, then never again.
  const show = layer.show;
  const hide = layer.hide;
  layer.hide = () => {
    hide();
    shell.picking?.(false);
  };
  layer.show = (display, cursor) => {
    show(display, cursor);
    shell.picking?.(true);
    const text = hint.onRaise();
    if (text) layer.send("hint", { text });
  };

  const openPdfReader = dialog
    ? async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          properties: ["openFile"],
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (canceled || !filePaths[0]) return;
        const data = readFileSync(filePaths[0]).toString("base64");
        await shell.composer.attach({
          id: globalThis.crypto.randomUUID(),
          name: basename(filePaths[0]),
          mediaType: "application/pdf",
          data,
        });
      }
    : undefined;

  const quick = createQuick({
    locale,
    once,
    autoExplain: shell.autoExplain.get,
    host: {
      attach: (attachment) => shell.composer.attach(attachment),
      show: (event) => shell.quickShow?.(event),
      pauseAuto: () => void shell.autoExplain.set(false),
      resumeAuto: () => void shell.autoExplain.set(true),
      openPdfReader,
    },
  });

  const grouper = createGrouper(now ? { clock: now } : {});
  const cropper = createCropper({ nativeImage });
  let locator = shell.locator ?? windowLocator;
  let guard = shell.guard ?? openGuard;
  controller = createPickController({
    displays: () => screen.getAllDisplays(),
    cursor: () => shell.cursor(),
    picker: (display) => createPicker({ locator, guard, display }),
    layer,
    // The layer hides before the grab, and the surface guard hides the rest.
    settle: async () => {},
    // The card is hidden for the grab and opens after it.
    grab: (display) => shell.captureScreen(display, shell.windows()),
    crop: cropper,
    pickedWhileHeld: hint.onPick,
    grouper,
    newChat: () => shell.newChat?.(),
    caught: () => shell.caught?.(),
    // The pictures are drawn into Blink's mouth, not onto its feet.
    mouthPoint: shell.mouthPoint ?? shell.blinkPoint,
    quick,
    reduced: () =>
      systemPreferences?.getAnimationSettings?.().prefersReducedMotion === true,
    onError,
  });

  const keys = createPickKeys({
    pickKey: () => pickKey,
    /** The window locator and the secure-field guard plug in here; each pick reads
     * the current ones when the layer rises. */
    setLocator(next, nextGuard) {
      locator = next;
      if (nextGuard) guard = nextGuard;
    },
    onRaise: () => void controller.raise().catch(onError),
    onDrop: (reason) => void controller.drop(reason).catch(onError),
    ...timers,
  });
  const platform = shell.platform ?? process.platform;
  // On macOS the keys come from a separate helper process: the in-process hook
  // handed every key to the main thread and deadlocked with input methods such
  // as Zhuyin. uiohook is never loaded there.
  const source =
    platform === "darwin"
      ? createHelperKeySource({
          command:
            shell.keytap ??
            keytapPath({
              appDir: fileURLToPath(new URL("..", import.meta.url)),
            }),
          spawn,
          handle: keys.handle,
          onError,
          ...timers,
        })
      : createKeySource({ load: loadKeys, handle: keys.handle, onError });
  const started =
    env.BLINKLING_PICK_KEYS === "0" ? { ok: false } : await source.start();

  // macOS only lets an app listen for keys once it is allowed to. The first
  // refusal raises the system's own prompt (it lists the app and opens the
  // switch), then a fresh helper is tried every few seconds until the user has
  // flipped it, so the pick key works without a restart. A missing helper is
  // not retried: no switch would fix it.
  let retry = null;
  let disposed = false;
  const trusted = (ask) =>
    systemPreferences?.isTrustedAccessibilityClient?.(ask);
  if (
    !started.ok &&
    env.BLINKLING_PICK_KEYS !== "0" &&
    platform === "darwin" &&
    started.error?.code !== "MISSING"
  ) {
    if (trusted(false) === false) trusted(true);
    const setTimer = timers.setTimer ?? setTimeout;
    const poll = () => {
      retry = setTimer(async () => {
        if (disposed) return;
        const next = await source.start();
        if (!next.ok && next.error?.code !== "MISSING") poll();
      }, RETRY_MS);
    };
    poll();
  }

  const api = {
    get started() {
      return source.started();
    },
    /** Everything that is taken goes this way: an array of Taken (a pick) or a
     * capture from the region selector, the full-page grab or the hotkey. */
    deliver: (input) => controller.deliver(input),
    /** The quick question the card's composer is carrying. */
    quick,
    setPickKey(name) {
      if (!PICK_KEY_NAMES.includes(name)) return false;
      pickKey = name;
      try {
        writeFileSync(settingsFile, JSON.stringify({ pickKey }));
      } catch (error) {
        onError(error);
      }
      keys.refresh();
      return true;
    },
    pickKey: () => pickKey,
    /** The window locator and the secure-field guard plug in here; each pick reads
     * the current ones when the layer rises. */
    setLocator(next, nextGuard) {
      locator = next;
      if (nextGuard) guard = nextGuard;
    },
    /** The locator in use now, for the privacy guard to look through the same one. */
    locator: () => locator,
    /** The privacy guard (`privacy.openGuard`) every pick and area asks first. */
    setGuard(next) {
      guard = next;
    },
    /** The same pieces, for tests that drive the flow without native input. */
    flying: () => layer.flying(),
    test: { keys, controller, layer, quick, grouper, once },
    dispose() {
      disposed = true;
      if (retry !== null) (timers.clearTimer ?? clearTimeout)(retry);
      source.stop();
      keys.dispose();
      quick.dispose();
      layer.dispose();
      raiser.dispose();
    },
  };
  if (env.BLINKLING_E2E === "1") exposeTestHook("pick", api, env);
  return api;
}
