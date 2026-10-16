import { duration } from "../shared/motion.mjs";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_DATA = 28 * 1024 * 1024;
const BASE64 = /^[A-Za-z0-9+/=]+$/;

/** An image the viewer will show: a known type and base64 of a sane size. */
export function validImage(image) {
  if (
    !image ||
    typeof image !== "object" ||
    !TYPES.has(image.mediaType) ||
    typeof image.data !== "string" ||
    !image.data ||
    image.data.length > MAX_DATA ||
    !BASE64.test(image.data)
  )
    return null;
  return {
    mediaType: image.mediaType,
    data: image.data,
    name: typeof image.name === "string" ? image.name.slice(0, 200) : "",
  };
}

/** The image viewer: one hidden window over the display Blink is on, reused.
 * A picture in the card opens it; Esc, the backdrop or the close button put it
 * away. While it is up the interaction machine is told, so Blink stays out of
 * the way.
 *
 * win: {webContents, isDestroyed, isVisible, showInactive, hide, focus,
 *   setBounds}; ipc: {on}; bounds(): the display's rectangle;
 * onChange(open): told when it opens and closes. */
export function createViewerController({
  win,
  ipc,
  bounds,
  onChange = () => {},
  focus,
  loaded = Promise.resolve(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let open = false;
  let hideTimer = null;
  let openings = 0;
  const send = (channel, value) => {
    if (!win.isDestroyed()) win.webContents.send(channel, value);
  };

  function close() {
    if (!open) return;
    open = false;
    send("blinkling:viewer-close", {});
    onChange(false);
    clearTimer(hideTimer);
    hideTimer = setTimer(() => {
      hideTimer = null;
      if (!open && !win.isDestroyed()) win.hide();
    }, duration.base);
    focus?.restore();
  }
  ipc.on("blinkling:viewer-close", (event) => {
    if (event?.sender === win.webContents) close();
  });

  return {
    isOpen: () => open,
    async open(raw) {
      const image = validImage(raw);
      if (!image || win.isDestroyed()) return false;
      const mine = ++openings;
      const was = open;
      open = true;
      clearTimer(hideTimer);
      hideTimer = null;
      if (!was) onChange(true);
      await loaded;
      if (!open || mine !== openings) return true;
      if (!was) await focus?.remember();
      win.setBounds(bounds());
      send("blinkling:viewer-open", image);
      win.showInactive();
      focus?.activate(win);
      win.focus();
      return true;
    },
    close,
    dispose() {
      clearTimer(hideTimer);
    },
  };
}
