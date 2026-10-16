import { bindPanelNudge } from "../shared/panel-nudge.mjs";
import { duration } from "../shared/motion.mjs";
import { LANGUAGE_NAMES, LOCALES } from "../shared/i18n.mjs";

export const SETTINGS_SIZE = Object.freeze({ width: 440, height: 640 });
const PICK_KEYS = Object.freeze(["control", "option"]);
const HELP = new Set(["welcome", "guide"]);

/** The settings window: one hidden window made at start and reused (N6.4).
 * win: {webContents, isDestroyed, isVisible, isFocused, setBounds, showInactive,
 *   hide, focus}; ipc: {on, handle}; store: settings store; hotkey: {get, set};
 * pickKey: {get, set} (used on macOS only); host: {welcome, guide,
 *   languageChanged}, where languageChanged restarts Blink in the new language;
 * focus: {remember, activate, restore}. */
export function createSettingsController({
  win,
  ipc,
  locale,
  platform,
  version,
  store,
  hotkey,
  pickKey,
  host,
  focus,
  workArea,
  nudges,
  loaded = Promise.resolve(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const mac = platform === "darwin";
  let open = false;
  let hideTimer = null;
  let openings = 0;

  const trusted = (event) => event?.sender === win.webContents;
  const send = (channel, value) => {
    if (!win.isDestroyed()) win.webContents.send(channel, value);
  };
  const view = () => ({
    locale,
    platform,
    version,
    hotkey: hotkey.get(),
    pickKey: mac ? pickKey.get() : null,
    pickKeys: mac ? [...PICK_KEYS] : null,
    startWithClaudeCode: store.get().startWithClaudeCode,
    language: store.get().language,
    languages: LOCALES.map((code) => ({ code, name: LANGUAGE_NAMES[code] })),
  });

  const place = () => {
    const area = workArea();
    const { width, height } = SETTINGS_SIZE;
    const centred = {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
    };
    win.setBounds(shift ? shift(centred, area) : centred);
  };
  const shift =
    nudges &&
    bindPanelNudge({
      ipc,
      win,
      channel: "blinkling:settings-nudge",
      key: () => "settings",
      nudges,
      replace: () => open && place(),
    });

  async function change(request) {
    const refuse = (reason = "invalid") => ({
      ok: false,
      reason,
      state: view(),
    });
    if (!request || typeof request !== "object") return refuse();
    const { key, value } = request;
    try {
      if (key === "hotkey") {
        if (typeof value !== "string" || !value) return refuse();
        const result = await hotkey.set(value);
        return result.ok
          ? { ok: true, state: view() }
          : refuse(result.reason ?? "unavailable");
      }
      if (key === "pickKey") {
        if (!mac || !PICK_KEYS.includes(value)) return refuse();
        return pickKey.set(value) ? { ok: true, state: view() } : refuse();
      }
      if (key === "startWithClaudeCode") {
        store.set({ startWithClaudeCode: value });
        return { ok: true, state: view() };
      }
      if (key === "language") {
        const before = store.get().language;
        store.set({ language: value });
        // Every window speaks the language it started with, so a new one
        // takes a restart; the answer goes out first.
        if (value !== before) setTimer(() => host.languageChanged?.(), 0);
        return { ok: true, state: view() };
      }
    } catch {
      return refuse();
    }
    return refuse();
  }

  function close() {
    if (!open) return;
    open = false;
    send("blinkling:settings-close", {});
    // The window stays long enough for the reverse transition, unless reopened.
    clearTimer(hideTimer);
    hideTimer = setTimer(() => {
      hideTimer = null;
      if (!open && !win.isDestroyed()) win.hide();
    }, duration.base);
    focus.restore();
  }

  ipc.handle("blinkling:settings-ready", (event) =>
    trusted(event) ? view() : null,
  );
  ipc.handle("blinkling:settings-set", (event, request) =>
    trusted(event) ? change(request) : { ok: false, reason: "invalid" },
  );
  ipc.on("blinkling:settings-help", (event, name) => {
    if (!trusted(event) || !HELP.has(name)) return;
    host[name]();
  });
  ipc.on("blinkling:settings-close", (event) => {
    if (trusted(event)) close();
  });

  return {
    get isOpen() {
      return open;
    },
    async open() {
      if (open) return;
      open = true;
      clearTimer(hideTimer);
      hideTimer = null;
      // The page registers its listeners while it loads; a message sent earlier
      // (the first start opens before the page is up) would be lost.
      const mine = ++openings;
      await loaded;
      if (!open || mine !== openings) return;
      await focus.remember();
      send("blinkling:settings-state", view());
      place();
      win.showInactive();
      focus.activate(win);
      win.focus();
      send("blinkling:settings-open", { nudge: nudges?.get("settings") });
    },
    close,
    dispose() {
      clearTimer(hideTimer);
    },
  };
}
