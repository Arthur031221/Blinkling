import { duration } from "../shared/motion.mjs";

export const SETTINGS_SIZE = Object.freeze({ width: 440, height: 560 });
const PICK_KEYS = Object.freeze(["control", "option"]);
const HELP = new Set(["welcome", "guide"]);

/** The settings window: one hidden window made at start and reused (N6.4).
 * win: {webContents, isDestroyed, isVisible, isFocused, setBounds, showInactive,
 *   hide, focus}; ipc: {on, handle}; store: settings store; hotkey: {get, set};
 * pickKey: {get, set} (used on macOS only); host: {welcome, guide};
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
  });

  const place = () => {
    const area = workArea();
    const { width, height } = SETTINGS_SIZE;
    win.setBounds({
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
    });
  };

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
      send("blinkling:settings-open", {});
    },
    close,
    dispose() {
      clearTimer(hideTimer);
    },
  };
}
