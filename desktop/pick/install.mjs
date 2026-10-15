import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLayers } from "./layer-window.mjs";
import { createRaiser } from "./raise.mjs";
import { createPickKeys } from "./keys.mjs";
import { createKeySource, loadUiohook } from "./keys-uiohook.mjs";
import { createPickController } from "./controller.mjs";
import { createPicker } from "./picker.mjs";
import { createGrouper } from "./group.mjs";
import { createCropper } from "./crop.mjs";
import { createOnce, fileStore } from "./once.mjs";
import { createPickHint } from "./teach.mjs";
import { askModel } from "./ask.mjs";
import { textAttachment } from "./taken.mjs";
import { t as pickText } from "./strings.mjs";
import { createMiniController } from "../mini/index.mjs";
import { pickLocale } from "../shared/i18n.mjs";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const miniFile = (name) => fileURLToPath(new URL(`../mini/${name}`, import.meta.url));

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
export const openGuard = Object.freeze({ allowed: () => true });

/** The layer page talks to the main process through its own small preload, not the shell's. */
const layerOptions = (options) => ({
  ...options,
  webPreferences: { ...options.webPreferences, preload: here("layer-preload.cjs") },
});

const PICK_KEY_NAMES = ["control", "option"];

function pickKeySetting(file, env) {
  const fromEnv = env.BLINKLING_PICK_KEY;
  if (PICK_KEY_NAMES.includes(fromEnv)) return fromEnv;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")).pickKey;
    if (PICK_KEY_NAMES.includes(saved)) return saved;
  } catch {}
  return "control";
}

/** Wires the pick (M4–M7, N1–N3): the global pick key, one layer window per
 * display, the controller, the mini composer. The shell calls this once and
 * routes every capture through the returned `deliver`.
 *
 * electron: {BrowserWindow, screen, ipcMain, nativeImage, systemPreferences?, dialog?}
 * shell: {userDataDir, windowOptions(bounds, focusable), secure(win), windows(),
 *   input, blinkPoint(), workArea(), session, autoExplain:{get, set},
 *   composer:{open, attach}, captureScreen(display, windows), newChat?, caught? (Blink bounces when the flight lands),
 *   locator?, guard?, env?, platform?} */
export async function installPick({ electron, shell, loadKeys = loadUiohook, setTimer, clearTimer, now, onError = () => {} }) {
  const { BrowserWindow, screen, ipcMain, nativeImage, systemPreferences, dialog } = electron;
  const env = shell.env ?? process.env;
  const locale = pickLocale([env.BLINKLING_LOCALE, ...(shell.locales ?? [])].filter(Boolean));
  const timers = setTimer ? { setTimer, clearTimer } : {};

  const once = createOnce(fileStore(join(shell.userDataDir, "pick-once.json")));
  const hint = createPickHint({ once, t: pickText(locale) });
  const settingsFile = join(shell.userDataDir, "pick-settings.json");
  let pickKey = pickKeySetting(settingsFile, env);

  let controller = null;
  const raiser = createRaiser();
  const layer = createLayers({
    BrowserWindow,
    screen,
    ipcMain,
    options: layerOptions(shell.windowOptions({ x: 0, y: 0, width: 1, height: 1 }, false)),
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
  layer.show = (display, cursor) => {
    show(display, cursor);
    const text = hint.onRaise();
    if (text) layer.send("hint", { text });
  };

  const miniWindow = new BrowserWindow({
    ...shell.windowOptions({ x: 0, y: 0, width: 392, height: 140 }, true),
    webPreferences: { ...shell.windowOptions({}, true).webPreferences, preload: miniFile("preload.cjs") },
  });
  shell.secure(miniWindow);
  void miniWindow.loadFile(miniFile("index.html")).catch(onError);

  let lastEntries = [];
  const sendTurn = (turn) => shell.session.send(turn);
  const translatePage = async () => {
    const page = lastEntries.find((e) => e.taken?.kind === "page" && e.taken.browser);
    if (!page) return;
    const { chips } = askModel({ items: [{ kind: "text", text: page.taken.text }], locale: "en" });
    const prompt = chips.find((c) => c.id === "translate")?.prompt;
    await sendTurn({ id: globalThis.crypto.randomUUID(), text: prompt, attachments: [page.attachment], source: "quick-ask" });
  };
  const openPdfReader = dialog
    ? async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "PDF", extensions: ["pdf"] }] });
        if (canceled || !filePaths[0]) return;
        const data = readFileSync(filePaths[0]).toString("base64");
        await shell.composer.attach({ id: globalThis.crypto.randomUUID(), name: basename(filePaths[0]), mediaType: "application/pdf", data });
      }
    : undefined;

  const mini = createMiniController({
    win: miniWindow,
    ipc: ipcMain,
    locale,
    focus: {
      remember: async () => {
        await shell.input?.rememberFocus();
      },
      activate: (win) => shell.input?.activate(win),
      restore: () => shell.input?.restoreFocus(),
    },
    workArea: shell.workArea,
    blinkPoint: shell.blinkPoint,
    once,
    autoExplain: shell.autoExplain.get,
    host: {
      send: sendTurn,
      openComposer: async (seed) => {
        await shell.composer.open();
        for (const attachment of seed.attachments ?? []) await shell.composer.attach(attachment);
        if (seed.text) await shell.composer.attach(textAttachment(seed.text, "Message.txt"));
      },
      pauseAuto: () => void shell.autoExplain.set(false),
      resumeAuto: () => void shell.autoExplain.set(true),
      translatePage,
      openPdfReader,
    },
    ...timers,
  });
  const openMini = mini.open;
  mini.open = (entries) => {
    lastEntries = entries;
    return openMini(entries);
  };

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
    grab: (display) => shell.captureScreen(display, [...shell.windows(), miniWindow]),
    crop: cropper,
    grouper,
    newChat: () => shell.newChat?.(),
    caught: () => shell.caught?.(),
    blinkPoint: shell.blinkPoint,
    mini,
    reduced: () => systemPreferences?.getAnimationSettings?.().prefersReducedMotion === true,
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
  const source = createKeySource({ load: loadKeys, handle: keys.handle, onError });
  const started = env.BLINKLING_PICK_KEYS === "0" ? { ok: false } : await source.start();

  const api = {
    started: started.ok,
    /** Everything that is taken goes this way: an array of Taken (a pick) or a
     * capture from the region selector, the full-page grab or the hotkey. */
    deliver: (input) => controller.deliver(input),
    openMini: (entries) => mini.open(entries),
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
    /** The same pieces, for tests that drive the flow without native input. */
    test: { keys, controller, layer, mini, grouper, once, miniWindow },
    dispose() {
      source.stop();
      keys.dispose();
      mini.dispose();
      layer.dispose();
      raiser.dispose();
      if (!miniWindow.isDestroyed()) miniWindow.destroy();
    },
  };
  if (env.BLINKLING_E2E === "1") exposeForTests(api);
  return api;
}

/** The shell assigns `globalThis.blinklingTest` as one object later on; hang the
 * pick on it whenever that happens, without touching the shell's literal. */
function exposeForTests(api) {
  let value = globalThis.blinklingTest;
  if (value) value.pick = api;
  Object.defineProperty(globalThis, "blinklingTest", {
    configurable: true,
    get: () => value,
    set(next) {
      value = next;
      if (value && typeof value === "object") value.pick = api;
    },
  });
}
