/** Pick and the mini composer, wired to the shell (M1-M7). One call from the
 * shell; everything Electron-shaped is passed in, so a test can drive the
 * whole pipeline with fakes. Provides deliver(taken): every capture path
 * (pick, region overlay, hotkey, page) ends here and flies into Blink. */
import { readFileSync, writeFileSync } from "node:fs";
import { cropGeometry } from "../capture/core.mjs";
import { createMini } from "../mini/model.mjs";
import { createMiniWindow } from "../mini/window.mjs";
import { duration } from "../shared/motion.mjs";
import { setLayer } from "../shared/escape.mjs";
import { defaultChip } from "./ask.mjs";
import { createPickController } from "./controller.mjs";
import { createKeySource } from "./keys-source.mjs";
import { createPickKeys } from "./keys.mjs";
import { createLayers } from "./layer.mjs";
import { pickText } from "./strings.mjs";

const ATTACH_RETRY = 10;
const PICK_KEYS = new Set(["control", "option"]);
const PDF_TITLE = /\.pdf\b|\bpdf\b/i;

const intersects = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const clamp = (rect, bounds) => {
  const x = Math.max(rect.x, bounds.x);
  const y = Math.max(rect.y, bounds.y);
  return {
    x,
    y,
    width: Math.min(rect.x + rect.width, bounds.x + bounds.width) - x,
    height: Math.min(rect.y + rect.height, bounds.y + bounds.height) - y,
  };
};

const seedOf = (id) => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/** Until the locator is merged: the whole screen under the pointer is the one
 * thing that can be picked. */
function screenLocator(displayAt) {
  const screenAt = (point) => {
    const display = displayAt(point);
    return {
      id: `screen:${display.id}`,
      kind: "screen",
      bounds: { ...display.bounds },
      role: "screen",
      name: "",
      text: "",
      secure: false,
      parentId: null,
      window: null,
      display,
      source: "screen",
    };
  };
  return {
    locate: async (point) => screenAt(point),
    elements: async () => [],
    parent: async () => null,
    selectionAt: async () => null,
    textIn: async () => null,
    focus: async () => ({ secure: false, window: null }),
  };
}

function loadState(path) {
  try {
    return { hinted: false, pdfOffered: false, ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return { hinted: false, pdfOffered: false };
  }
}

export function installPick({
  blink,
  locator,
  guard = { allowed: () => true },
  settings,
  composer,
  autoExplain,
  session,
  send = () => {},
  electron,
  screenImage,
  host = {},
  input,
  statePath,
  locale,
  parts = {},
  workAreaFor,
  now,
} = {}) {
  const { screen } = electron;
  const makeLayers = parts.createLayers ?? createLayers;
  const makeMiniWindow = parts.createMiniWindow ?? createMiniWindow;
  const loadKeySource = parts.createKeySource ?? createKeySource;
  const p = pickText(locale);
  const persisted = loadState(statePath);
  const remember = () => {
    if (!statePath) return;
    try {
      writeFileSync(statePath, JSON.stringify(persisted));
    } catch {
      // A read-only profile only means the hint may show again.
    }
  };

  const timeline = [];
  const mark = (name, detail) => timeline.push({ name, t: Date.now(), ...(detail ?? {}) });
  const frozen = (d) => ({
    id: String(d.id),
    bounds: { ...d.bounds },
    workArea: { ...d.workArea },
    scaleFactor: d.scaleFactor,
  });
  const displayAt = (point) => frozen(screen.getDisplayNearestPoint(point));

  let source = locator ?? screenLocator(displayAt);
  const delegate = (name) => (...args) => source[name](...args);
  const locating = Object.fromEntries(
    ["locate", "elements", "parent", "selectionAt", "textIn", "focus"].map((n) => [n, delegate(n)]),
  );

  let reducedMotion = false;
  let hint = false;
  let cursor = null;
  let picks = [];
  let playing = 0;
  let hideTimer = null;
  let disposed = false;

  const layers = makeLayers({
    electron,
    onPointer: (event) => void controller.pointer(event),
  });

  // ---- the screen grab -------------------------------------------------
  async function grab(rect, display) {
    const covering = [blink, miniWindow?.win].filter(
      (w) => w && !w.isDestroyed() && w.isVisible() && intersects(w.getBounds(), rect),
    );
    for (const w of covering) w.hide();
    try {
      await layers.blank(true);
      const image = await screenImage(display);
      const size = image.getSize();
      const local = clamp(rect, display.bounds);
      const crop = cropGeometry(
        { x: local.x - display.bounds.x, y: local.y - display.bounds.y, width: local.width, height: local.height },
        {
          region: { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height },
          pixelWidth: size.width,
          pixelHeight: size.height,
        },
      );
      const out = image.crop(crop);
      return { data: out.toPNG().toString("base64"), width: crop.width, height: crop.height };
    } finally {
      void layers.blank(false);
      for (const w of covering) if (!w.isDestroyed()) w.showInactive();
    }
  }

  // ---- the pick controller ---------------------------------------------
  const controller = createPickController({
    locator: locating,
    guard,
    capture: grab,
    displayAt,
    ...(now ? { now } : {}),
    onState: (state) => {
      layers.state({
        ...state,
        cursor,
        hint: hint && state.active && !state.count ? p("hint") : "",
        text: { lock: p("lock"), full: p("full"), thisFrame: p("thisFrame") },
      });
    },
    onTaken: (taken, meta) => void deliver(taken, meta),
    onError: (error) => mark("capture-error", { message: String(error?.message ?? error) }),
  });

  // ---- the mini composer -----------------------------------------------
  const safeHost = {
    translatePage: async () => {
      try {
        await host.translatePage?.();
      } catch (error) {
        mark("host-error", { message: String(error?.message ?? error) });
      }
    },
    openPdfReader: async () => {
      try {
        await host.openPdfReader?.();
      } catch (error) {
        mark("host-error", { message: String(error?.message ?? error) });
      }
    },
  };
  const mini = createMini({
    locale,
    autoExplain,
    host: safeHost,
    send: async (turn) => {
      controller.touchChat();
      await session.send(turn);
      mark("sent", { text: turn.text, attachments: turn.attachments.length });
    },
    grow: (seed) => composer.open(seed),
    discard: () => {
      picks = [];
      controller.reset();
      mark("discarded");
    },
    restoreFocus: () => input?.restoreFocus?.(),
    close: () => miniWindow.hide(),
  });
  const miniWindow = makeMiniWindow({
    electron,
    mini,
    locale,
    blinkBounds: () => blink.getBounds(),
    workAreaFor:
      workAreaFor ?? ((rect) => screen.getDisplayMatching(rect).workArea),
    input,
  });
  let miniOpen = false;
  const unsubscribeMini = mini.subscribe((state) => {
    if (state.open === miniOpen) return;
    miniOpen = state.open;
    if (state.open) {
      setLayer("mini", () => void mini.key({ key: "Escape" }));
      mark("mini-open");
      void miniWindow.show();
    } else {
      setLayer("mini", null);
      mark("mini-close");
    }
  });

  // ---- offers ----------------------------------------------------------
  function offersFor(taken, meta) {
    const offers = [];
    if (taken.kind === "page" && defaultChip(taken, locale) === "translate")
      offers.push({ id: "translate-page" });
    const titled = PDF_TITLE.test(meta?.window?.title ?? "");
    if (!persisted.pdfOffered && titled && !taken.text && ["page", "window", "section", "area"].includes(taken.kind)) {
      offers.push({ id: "pdf" });
      persisted.pdfOffered = true;
      remember();
    }
    return offers;
  }

  // ---- delivery --------------------------------------------------------
  let queue = Promise.resolve();
  function deliver(taken, meta = {}) {
    const run = queue.then(() => settle(taken, meta));
    queue = run.catch(() => {});
    return run;
  }

  async function settle(taken, meta) {
    if (disposed) return;
    const id = meta.id ?? crypto.randomUUID();
    const chat = controller.touchChat();
    if (chat.fresh && picks.length) {
      // Sixty seconds passed: the earlier picks belong to an older chat.
      picks = [];
      controller.keepOnly(id);
      send({ type: "reset" });
      mark("new-chat");
    }
    const entry = { ...taken, id };
    picks = meta.replaces
      ? picks.map((x) => (x.id === meta.replaces ? entry : x))
      : [...picks, entry];
    mark("taken", { id, kind: taken.kind, source: taken.source });
    hint = false;

    clearTimeout(hideTimer);
    playing++;
    try {
      if (!layers.shown) layers.show();
      const b = blink.getBounds();
      await layers.play({
        taken,
        seed: seedOf(id),
        blink: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        reducedMotion,
        text: { thisFrame: p("thisFrame") },
      });
    } finally {
      playing--;
    }
    mark("landed");
    blink.webContents.send("blinkling:catch");
    mark("catch");
    if (!keys.raised) hideLayersSoon();
    if (miniOpen) mini.update(picks);
    else mini.open(picks, offersFor(taken, meta));
  }

  // ---- the keys --------------------------------------------------------
  function hideLayersSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!keys.raised && !playing && !disposed) layers.hide();
    }, duration.base);
    hideTimer.unref?.();
  }

  const keyName = () => {
    const wanted = settings?.get?.("pickKey");
    if (PICK_KEYS.has(wanted)) return wanted;
    return process.platform === "darwin" ? "option" : "control";
  };
  const keys = createPickKeys({
    key: keyName(),
    onRaise() {
      mark("raise");
      clearTimeout(hideTimer);
      cursor = screen.getCursorScreenPoint();
      if (!persisted.hinted) {
        persisted.hinted = true;
        hint = true;
        remember();
      }
      layers.show();
      mark("layers-shown");
      void controller.raise().then(() => controller.pointer({ type: "move", ...cursor }));
    },
    onDrop(why) {
      mark("drop", { why });
      hint = false;
      controller.drop();
      if (!playing) hideLayersSoon();
    },
  });
  const unsubscribeSettings = settings?.on?.("change", () => keys.setKey(keyName()));
  let unsubscribeKeys = () => {};
  let keysAvailable = false;
  const ready = Promise.resolve(loadKeySource()).then((keySource) => {
    keysAvailable = keySource.available;
    if (disposed) return;
    if (keySource.available) unsubscribeKeys = keySource.subscribe((event) => keys.feed(event));
    else mark("keys-unavailable", { reason: keySource.reason });
  });

  // ---- the test hooks ---------------------------------------------------
  // The shell assigns its own blinklingTest object after this runs; hang the
  // hooks on it as soon as it exists.
  let attachTimer = null;
  if (process.env.BLINKLING_E2E === "1") {
    const hooks = {
      timeline: () => structuredClone(timeline),
      frames: () => layers.frames(),
      layers,
      mini,
      miniWindow,
      controller,
      keys,
      picks: () => structuredClone(picks),
      state: () => structuredClone(persisted),
      useLocator: (next) => {
        source = next ?? screenLocator(displayAt);
      },
      setReducedMotion: (value) => {
        reducedMotion = !!value;
      },
      feed: (event) => keys.feed(event),
      keyAvailable: () => keysAvailable,
      deliver,
    };
    const attach = () => {
      if (disposed) return;
      if (globalThis.blinklingTest) globalThis.blinklingTest.pick = hooks;
      else {
        attachTimer = setTimeout(attach, ATTACH_RETRY);
        attachTimer.unref?.();
      }
    };
    attach();
  }

  return {
    ready,
    mini,
    deliver,
    /** Open the mini composer on the last chat, as the Blink menu does. */
    async openMini({ conversation = "last" } = {}) {
      if (conversation !== "last") return;
      mini.open(picks, []);
    },
    dispose() {
      disposed = true;
      clearTimeout(hideTimer);
      clearTimeout(attachTimer);
      unsubscribeKeys();
      unsubscribeSettings?.();
      unsubscribeMini();
      keys.dispose();
      setLayer("mini", null);
      miniWindow.dispose();
      layers.dispose();
    },
  };
}
