import { duration, easing, timing } from "../shared/motion.mjs";
import { excluded } from "./exclusion.mjs";
export function aborted(signal) {
  signal?.throwIfAborted();
}
/** Settle within ms or reject with {code}. A hung step must never leave the
 * capture marked busy forever. */
export function deadline(promise, ms, code, message = `${code}: timed out`) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error(message), { code })),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
// Handing a finished capture to the card waits on a window that may still be
// loading or closing. The wait is bounded so a stuck handler cannot hold the
// caller (and everything chained behind it) forever.
export function deliverCapture(onCapture, capture, timeout = 15000) {
  return deadline(
    Promise.resolve().then(() => onCapture(capture)),
    timeout,
    "CAPTURE_DELIVERY_TIMEOUT",
    "Capture could not be delivered",
  );
}
export function freezeDisplay(display) {
  return Object.freeze({
    id: String(display.id),
    bounds: Object.freeze({ ...display.bounds }),
    workArea: Object.freeze({ ...display.workArea }),
    scaleFactor: display.scaleFactor,
  });
}
export function cropGeometry(rect, capture) {
  const b = capture.region;
  if (
    !rect ||
    !["x", "y", "width", "height"].every((k) => Number.isFinite(rect[k])) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width < 1 ||
    rect.height < 1 ||
    rect.x + rect.width > b.width ||
    rect.y + rect.height > b.height
  )
    throw new Error("Invalid capture region");
  const sx = capture.pixelWidth / b.width;
  const sy = capture.pixelHeight / b.height;
  const x = Math.floor(rect.x * sx);
  const y = Math.floor(rect.y * sy);
  return {
    x,
    y,
    width:
      Math.min(capture.pixelWidth, Math.ceil((rect.x + rect.width) * sx)) - x,
    height:
      Math.min(capture.pixelHeight, Math.ceil((rect.y + rect.height) * sy)) - y,
  };
}
export const fadeDuration = (reduced) => (reduced ? 0 : duration.fast);

/** Runs in the surface's own page. One named animation on the root goes from
 * opacity 1 to 0; playing it backwards fades in from wherever it stopped, so a
 * capture that starts during a fade-in reverses it instead of jumping. Resolves
 * once the target opacity is on screen. */
export function fadeScript(
  to,
  { duration: ms, easing: curve, reduced, instant = false },
) {
  return `(() => {
  const root = document.documentElement;
  const name = "blinkling-surface-fade";
  const reduced =
    ${reduced ? "true" : "false"} ||
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  let fade = root.getAnimations().find((a) => a.id === name);
  if (!fade && ${to} === 1) return Promise.resolve();
  if (!fade) {
    fade = root.animate([{ opacity: 1 }, { opacity: 0 }], {
      id: name,
      duration: ${ms},
      easing: ${JSON.stringify(curve)},
      fill: "both",
    });
    fade.pause();
    fade.currentTime = 0;
  }
  if (reduced || (${instant ? "true" : "false"} && ${to} === 0)) {
    fade.playbackRate = 1;
    if (${to} === 0) fade.finish();
    else fade.cancel();
    return Promise.resolve();
  }
  fade.playbackRate = ${to} === 0 ? 1 : -1;
  fade.play();
  return fade.finished.then(
    () => {
      if (${to} === 1) fade.cancel();
    },
    () => {},
  );
})()`;
}

/** Fades one own window's page to opacity 0 or 1. The window itself is never
 * hidden, moved or re-shown, so nothing pops and nothing is re-activated. Out
 * is at once, because every frame Blink is gone is seen; back in is a fade. */
export function fadeWindow(win, to, reduced = false) {
  const script = fadeScript(to, {
    duration: fadeDuration(reduced),
    easing: easing.standard,
    reduced,
    instant: true,
  });
  return win.webContents.executeJavaScript(script, false);
}
/** Frames the compositor is given to present a faded window before the screen
 * is read: a virtual display at twice the scale needs more than a few, and a
 * card left in the picture is read as a screen that changed. X11 presents the
 * cleared page in two (a read after two frames still showed the card in the
 * picture, after three it was clean), so there it waits for four, which keeps
 * Blink out of sight for as short a time as the read allows. */
export const SETTLE_FRAMES =
  process.platform === "linux" && !process.env.WAYLAND_DISPLAY ? 4 : 8;
const frames = (count) =>
  new Promise((resolve) => setTimeout(resolve, count * timing.frame));
/** Includes temporary windows supplied by feature services. A failed capture
 * must release the queue, and neither cancellation nor restore may activate
 * Blink. Surfaces fade out before the screen is read and back in after. */
export class SurfaceGuard {
  #tail = Promise.resolve();
  constructor(
    windows,
    {
      fade = (win, to) => fadeWindow(win, to),
      // The page is clear; let the compositor present that frame before the read.
      settle = () => frames(SETTLE_FRAMES),
      // A window the system keeps out of every screen read needs no hiding.
      keep = excluded,
    } = {},
  ) {
    this.keep = keep;
    this.windows = windows;
    this.fade = fade;
    this.settle = settle;
  }
  run(task, signal) {
    const result = this.#tail.then(async () => {
      aborted(signal);
      // Surfaces that are shown while the first ones fade (the card a guide or
      // an ask opens at the same moment) are faded too, so none is in the image.
      const faded = new Set();
      const fadeVisible = async () => {
        const fresh = this.windows().filter(
          (w) =>
            !w.isDestroyed() && w.isVisible() && !faded.has(w) && !this.keep(w),
        );
        for (const w of fresh) faded.add(w);
        await Promise.all(
          fresh.map((w) => Promise.resolve(this.fade(w, 0)).catch(() => {})),
        );
        return fresh.length;
      };
      try {
        for (let round = 0; round < 3; round++) {
          const count = await fadeVisible();
          // Nothing was hidden, so there is no frame to wait for.
          if (!count) break;
          await this.settle();
          aborted(signal);
        }
        return await task();
      } finally {
        await Promise.all(
          [...faded]
            .filter((w) => !w.isDestroyed())
            .map((w) => Promise.resolve(this.fade(w, 1)).catch(() => {})),
        );
      }
    });
    this.#tail = result.catch(() => {});
    return result;
  }
}
