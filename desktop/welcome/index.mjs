import { duration } from "../shared/motion.mjs";

export const WELCOME_SIZE = Object.freeze({ width: 520, height: 600 });
const ACTIONS = new Set(["refresh", "request", "open"]);
const KEY_NAMES = Object.freeze({ control: "Control", option: "Option" });

/** The welcome window (N1.6): one hidden window made at start and reused. It
 * opens by itself on the first start and again from Settings. Three steps, all
 * in the page; this controller owns what the page may ask of the main process.
 *
 * win: {webContents, isDestroyed, isVisible, showInactive, hide, focus,
 *   setBounds}; ipc: {on, handle}; pickKey: {get}; once: {take};
 * permission: {status, request, open} (macOS screen recording only);
 * focus: {remember, activate, restore}. */
export function createWelcomeController({
  win,
  ipc,
  locale,
  platform,
  pickKey,
  permission,
  once,
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
  const status = () => (mac ? permission.status() : "unneeded");
  const view = () => ({
    locale,
    platform,
    keyName: mac ? (KEY_NAMES[pickKey.get()] ?? KEY_NAMES.control) : "Ctrl",
    permission: status(),
  });

  const place = () => {
    const area = workArea();
    const { width, height } = WELCOME_SIZE;
    win.setBounds({
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
    });
  };

  async function ask(action) {
    if (!ACTIONS.has(action)) return null;
    if (mac && action === "request") await permission.request();
    if (mac && action === "open") await permission.open();
    return status();
  }

  function close() {
    if (!open) return;
    open = false;
    send("blinkling:welcome-close", {});
    clearTimer(hideTimer);
    hideTimer = setTimer(() => {
      hideTimer = null;
      if (!open && !win.isDestroyed()) win.hide();
    }, duration.base);
    focus.restore();
  }

  async function show() {
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
    send("blinkling:welcome-state", view());
    place();
    win.showInactive();
    focus.activate(win);
    win.focus();
    send("blinkling:welcome-open", {});
  }

  ipc.handle("blinkling:welcome-ready", (event) =>
    trusted(event) ? view() : null,
  );
  ipc.handle("blinkling:welcome-permission", (event, action) =>
    trusted(event) ? ask(action) : null,
  );
  ipc.on("blinkling:welcome-close", (event) => {
    if (trusted(event)) close();
  });

  return {
    get isOpen() {
      return open;
    },
    open: show,
    /** True when this was the first start and the welcome opened. */
    async openFirstTime() {
      if (!once.take("welcome")) return false;
      await show();
      return true;
    },
    close,
    dispose() {
      clearTimer(hideTimer);
    },
  };
}
