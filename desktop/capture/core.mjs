export function aborted(signal) {
  signal?.throwIfAborted();
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
/** Includes temporary windows supplied by feature services. A failed capture must
 * release the queue, and neither cancellation nor restore may activate Blink. */
export class SurfaceGuard {
  #tail = Promise.resolve();
  constructor(
    windows,
    settle = () => new Promise((resolve) => setTimeout(resolve, 120)),
  ) {
    this.windows = windows;
    this.settle = settle;
  }
  run(task, signal) {
    const result = this.#tail.then(async () => {
      aborted(signal);
      const visible = this.windows().filter(
        (w) => !w.isDestroyed() && w.isVisible(),
      );
      try {
        for (const w of visible) w.hide();
        await this.settle();
        aborted(signal);
        return await task();
      } finally {
        for (const w of visible) if (!w.isDestroyed()) w.showInactive();
      }
    });
    this.#tail = result.catch(() => {});
    return result;
  }
}
