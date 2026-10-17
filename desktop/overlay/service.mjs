import { EventEmitter } from "node:events";
import { captureMatchesDisplay } from "./schema.mjs";
const COMMANDS = ["pulse", "focus", "fade", "revive"];
export class OverlayService extends EventEmitter {
  constructor({
    onDismiss = () => {},
    create,
    release = (window) => window.close(),
    escape,
    displays,
    windows = () => [],
    masks,
    reserve,
    log = (line) => console.info(line),
  } = {}) {
    super();
    this.epoch = 0;
    Object.assign(this, {
      onDismiss,
      create,
      release,
      escape,
      displays,
      windows,
      masks,
      reserve,
      log,
    });
    this.invalidate = () => {
      if (
        this.capture &&
        !captureMatchesDisplay(
          this.capture,
          this.displays
            .getAllDisplays()
            .find((d) => String(d.id) === this.capture.display.id),
        )
      )
        this.dismiss("display-changed");
    };
    for (const name of [
      "display-metrics-changed",
      "display-removed",
      "display-added",
    ])
      displays.on(name, this.invalidate);
  }
  async show(capture, drawings) {
    this.dismiss("replaced");
    if (
      !captureMatchesDisplay(
        capture,
        this.displays
          .getAllDisplays()
          .find((d) => String(d.id) === capture.display.id),
      )
    )
      throw Error("Guide capture is stale");
    if (
      this.escape &&
      !this.escape.register("Escape", () => this.dismiss("user"))
    )
      throw Error("Guide Escape shortcut unavailable");
    this.capture = capture;
    this.drawings = drawings;
    const epoch = this.epoch;
    try {
      const b = capture.display.bounds;
      const occupied =
        this.masks?.() ??
        this.windows()
          .filter((w) => w && !w.isDestroyed() && w.isVisible())
          .map((w) => {
            const r = w.getBounds();
            const x = Math.max(0, r.x - b.x),
              y = Math.max(0, r.y - b.y);
            return {
              x,
              y,
              width: Math.min(b.width, r.x + r.width - b.x) - x,
              height: Math.min(b.height, r.y + r.height - b.y) - y,
            };
          })
          .filter((r) => r.width > 0 && r.height > 0);
      // Room a window will take once the marks are up (the card at its
      // tallest), in screen coordinates: labels keep off it as well.
      const reserved = (this.reserve?.() ?? []).map((r) => ({
        x: r.x - b.x,
        y: r.y - b.y,
        width: r.width,
        height: r.height,
      }));
      const avoid = [...occupied, ...reserved]
        .map((r) => {
          const x = Math.max(0, r.x),
            y = Math.max(0, r.y);
          return {
            x,
            y,
            width: Math.min(b.width, r.x + r.width) - x,
            height: Math.min(b.height, r.y + r.height) - y,
          };
        })
        .filter((r) => r.width > 0 && r.height > 0);
      const window = await this.create(capture.display, drawings, { avoid });
      if (
        this.epoch !== epoch ||
        !captureMatchesDisplay(
          capture,
          this.displays
            .getAllDisplays()
            .find((d) => String(d.id) === capture.display.id),
        )
      ) {
        this.release(window);
        return false;
      }
      this.window = window;
    } catch (error) {
      if (this.epoch === epoch) this.dismiss("failed");
      throw error;
    }
    const window = this.window;
    this.closed = () => {
      if (this.window === window) this.dismiss("closed");
    };
    window.once("closed", this.closed);
    this.markClick = (n) => {
      if (this.window === window) this.emit("mark-click", n);
    };
    window.on("mark-click", this.markClick);
    this.emit("shown", capture);
    return true;
  }
  step(index) {
    if (!Number.isInteger(index) || index < -1 || index > 23)
      throw Error("Invalid guide step");
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send("blinkling:overlay:step", index);
    this.emit("step", index);
  }
  /** pulse, focus, fade and revive drive the marks that are already drawn. */
  command(name, arg) {
    if (!COMMANDS.includes(name))
      throw Error(`Unknown overlay command ${name}`);
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send("blinkling:overlay:command", { name, arg });
  }
  /** The window is click-through; it takes the mouse only over a badge. */
  setInteractive(on) {
    if (this.window && !this.window.isDestroyed())
      this.window.setIgnoreMouseEvents(!on, { forward: true });
  }
  /** Reasons: user (Esc, 結束導覽, click on Blink), content-changed,
   * capture-unavailable, display-changed, replaced, failed, closed. Each
   * dismissal of a visible guide logs exactly one of them. */
  dismiss(reason = "user") {
    this.epoch++;
    const active = !!this.capture;
    const window = this.window;
    this.capture = null;
    this.drawings = null;
    this.window = null;
    if (active) this.escape?.unregister("Escape");
    if (window && !window.isDestroyed()) {
      window.removeListener("mark-click", this.markClick);
      window.removeListener("closed", this.closed);
      this.release(window);
    }
    if (active) {
      this.log(`[blinkling] guide dismissed: ${reason}`);
      this.onDismiss(reason);
      this.emit("dismissed", reason);
    }
  }
  dispose() {
    this.dismiss("closed");
    for (const name of [
      "display-metrics-changed",
      "display-removed",
      "display-added",
    ])
      this.displays.removeListener(name, this.invalidate);
  }
}
