import { nativeImage } from "electron";
import { screenImage } from "../capture/index.mjs";
import { maskBitmap, contentMoved } from "./change.mjs";
export { maskBitmap } from "./change.mjs";
export class StalenessWatch {
  constructor({
    overlay,
    windows = () => [],
    masks,
    intervalMs = 1200,
    onError = () => {},
  }) {
    Object.assign(this, { overlay, windows, masks, intervalMs, onError });
    this.shown = () => this.start();
    this.dismissed = () => this.stop();
    overlay.on("shown", this.shown);
    overlay.on("dismissed", this.dismissed);
  }
  start() {
    this.stop();
    const capture = this.overlay.capture;
    this.reference = nativeImage
      .createFromBuffer(Buffer.from(capture.image.data, "base64"))
      .resize({ width: 160, height: 90 })
      .toBitmap();
    this.timer = setInterval(
      () => this.tick().catch(this.onError),
      this.intervalMs,
    );
    this.timer.unref();
  }
  async tick() {
    if (this.busy || !this.overlay.window || !this.reference) return;
    this.busy = true;
    const capture = this.overlay.capture,
      win = this.overlay.window;
    try {
      const masks = await win.webContents.executeJavaScript(
        "window.overlayMasks || []",
      );
      if (this.masks) masks.push(...this.masks());
      else
        for (const w of this.windows())
          if (!w.isDestroyed() && w.isVisible()) {
            const b = w.getBounds();
            masks.push({
              x: b.x - capture.display.bounds.x,
              y: b.y - capture.display.bounds.y,
              width: b.width,
              height: b.height,
            });
          }
      const image = (
        await screenImage(capture.display, { width: 160, height: 90 })
      ).resize({ width: 160, height: 90 });
      if (this.overlay.capture !== capture || this.overlay.window !== win)
        return;
      const a = maskBitmap(this.reference, 160, 90, capture.display, masks),
        b = maskBitmap(image.toBitmap(), 160, 90, capture.display, masks);
      if (
        contentMoved(
          a,
          b,
          160,
          90,
          capture.display,
          this.overlay.drawings?.map((d) => d.rect),
        )
      )
        this.overlay.dismiss("content-changed");
    } finally {
      this.busy = false;
    }
  }
  stop() {
    clearInterval(this.timer);
    this.reference = null;
  }
  dispose() {
    this.stop();
    this.overlay.removeListener("shown", this.shown);
    this.overlay.removeListener("dismissed", this.dismissed);
  }
}
