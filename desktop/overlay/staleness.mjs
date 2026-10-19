import {
  DriftDetector,
  SAMPLE_WIDTH,
  SAMPLE_HEIGHT,
  CAPTURE_FAILURE_LIMIT,
} from "./drift.mjs";
export { maskBitmap } from "./change.mjs";
/** `decode(base64, size)` and `grab(display, size)` return BGRA bitmaps; the
 * Electron-backed versions live in capture/integration.mjs. */
const size = { width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT };
const MOVING_TICKS = 2;
export class StalenessWatch {
  constructor({
    overlay,
    windows = () => [],
    masks,
    intervalMs = 1200,
    onError = () => {},
    decode,
    grab,
    checkReference = true,
  }) {
    Object.assign(this, {
      checkReference,
      overlay,
      windows,
      masks,
      intervalMs,
      onError,
      decode,
      grab,
    });
    this.shown = () => this.start();
    this.dismissed = () => this.stop();
    this.stepped = () => {
      this.epoch++;
      this.detector?.rebaseline();
    };
    this.epoch = 0;
    overlay.on("shown", this.shown);
    overlay.on("dismissed", this.dismissed);
    overlay.on("step", this.stepped);
  }
  start() {
    this.stop();
    const capture = this.overlay.capture;
    if (!capture?.image) return;
    this.failures = 0;
    // The first frame can be taken after a window has moved but before the
    // system has drawn it there: where it stood now stays masked for that tick.
    this.recent = this.places(capture);
    this.last = JSON.stringify(this.recent);
    this.waited = 0;
    this.detector = new DriftDetector({
      display: capture.display,
      reference: this.decode(capture.image.data, size),
      checkReference: this.checkReference,
    });
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref();
  }
  places(capture) {
    return this.masks
      ? this.masks()
      : this.windows()
          .filter((w) => !w.isDestroyed() && w.isVisible())
          .map((w) => {
            const b = w.getBounds();
            return {
              x: b.x - capture.display.bounds.x,
              y: b.y - capture.display.bounds.y,
              width: b.width,
              height: b.height,
            };
          });
  }
  async tick() {
    // Marks that follow the page scroll with it: the screen moving under them
    // is expected, so the picture says nothing about whether they are stale.
    if (this.overlay.anchored) return;
    if (this.busy || !this.overlay.window || !this.detector) return;
    this.busy = true;
    const { capture, window: win } = this.overlay,
      { detector, epoch } = this;
    try {
      const overlayMasks = [
        ...(await win.webContents.executeJavaScript(
          "window.overlayMasks || []",
        )),
      ];
      // Blink's windows are read before and after the screenshot: a card that
      // moves while it is taken is masked where it was and where it went.
      const before = this.places(capture);
      const frame = await this.grab(capture.display, size);
      const after = this.places(capture);
      const now = [...before, ...after];
      // A window the system is still moving may be drawn where it was a moment
      // ago: the last tick's places stay masked for one more tick.
      const masks = [...overlayMasks, ...now, ...(this.recent ?? [])];
      this.recent = now;
      this.failures = 0;
      // Blink's windows moved since the last tick (the card follows a step):
      // the system may not have drawn them in the new place yet, so this frame
      // says nothing about the screen. It is skipped, but never more than
      // MOVING_TICKS in a row, so a window that never stops cannot hide a change.
      const stood = this.last;
      this.last = JSON.stringify(after);
      if (JSON.stringify(before) !== stood && this.waited < MOVING_TICKS) {
        this.waited++;
        return;
      }
      this.waited = 0;
      if (
        this.overlay.capture !== capture ||
        this.overlay.window !== win ||
        this.epoch !== epoch
      )
        return;
      const reason = detector.observe(
        frame,
        masks,
        this.overlay.drawings?.map((d) => d.rect),
      );
      if (reason) this.overlay.dismiss(reason);
    } catch (error) {
      // A missed screenshot is not evidence that the screen changed.
      if (++this.failures >= CAPTURE_FAILURE_LIMIT) this.onError(error);
    } finally {
      this.busy = false;
    }
  }
  stop() {
    clearInterval(this.timer);
    this.detector = null;
  }
  dispose() {
    this.stop();
    this.overlay.removeListener("shown", this.shown);
    this.overlay.removeListener("dismissed", this.dismissed);
    this.overlay.removeListener("step", this.stepped);
  }
}
