import {
  app,
  BrowserWindow,
  desktopCapturer,
  nativeImage,
  screen,
  systemPreferences,
} from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  SurfaceGuard,
  aborted,
  cropGeometry,
  deadline,
  deliverCapture,
  freezeDisplay,
} from "./core.mjs";
import { IntentStore, PermissionRecovery } from "./permission.mjs";
import { browserOf } from "./window-hit.mjs";
import { CaptureOverlays, permissionWindow } from "./windows.mjs";
import { fitWindows, listWindows } from "./window-list.mjs";
import { createPngEncoder } from "./png.mjs";
const pngEncoder = createPngEncoder();
async function screenThumbnail(display, size) {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: size ?? {
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor),
    },
  });
  const source =
    sources.find((s) => s.display_id === String(display.id)) ??
    (sources.length === 1 && screen.getAllDisplays().length === 1
      ? sources[0]
      : undefined);
  if (!source || source.thumbnail.isEmpty())
    throw Object.assign(new Error("Screen capture unavailable"), {
      code: "CAPTURE_UNAVAILABLE",
    });
  return source.thumbnail;
}
export async function screenImage(display, size) {
  // Flatten the native representation to the actual encoded PNG dimensions.
  return nativeImage.createFromBuffer(
    (await screenThumbnail(display, size)).toPNG(),
  );
}
/** The whole screen as a PNG without holding up the main thread: the pixels
 * are copied out and compressed on another thread, and the picture is never
 * encoded, decoded and encoded again as it once was. */
async function screenPng(display) {
  const thumbnail = await screenThumbnail(display);
  const size = thumbnail.getSize();
  try {
    return {
      size,
      data: await pngEncoder.encode({ bitmap: thumbnail.toBitmap(), ...size }),
    };
  } catch {
    return { size, data: thumbnail.toPNG().toString("base64") };
  }
}
export async function readScreen(display) {
  const snapshot = freezeDisplay(display);
  const { size, data } = await screenPng(snapshot);
  return {
    id: randomUUID(),
    display: snapshot,
    region: {
      x: 0,
      y: 0,
      width: snapshot.bounds.width,
      height: snapshot.bounds.height,
    },
    pixelWidth: size.width,
    pixelHeight: size.height,
    capturedAt: Date.now(),
    image: {
      id: randomUUID(),
      name: "Screenshot.png",
      mediaType: "image/png",
      data,
    },
  };
}
// Compatibility entry point for existing shell smoke tests; shared guard prevents races.
let compatibilityGuard;
export function captureScreen(display, windows) {
  compatibilityGuard ??= new SurfaceGuard(() => []);
  return compatibilityGuard.run(() =>
    new SurfaceGuard(() => windows).run(() => readScreen(display)),
  );
}
export async function captureFullPage() {
  return { companionRequired: true };
}
/** The windows on one display as display-relative DIP boxes, front to back,
 * without any of our own. Never throws and never waits long. */
export async function windowsOn(display, list = listWindows) {
  const ids = new Set(
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed())
      .map((w) => w.getNativeWindowHandle().readUInt32LE(0)),
  );
  const native = await list({ own: { ids, pids: new Set([process.pid]) } });
  // macOS reports points, which are DIPs already.
  const toDip =
    process.platform === "darwin"
      ? (point) => point
      : (point) => screen.screenToDipPoint(point);
  return fitWindows(native, display, toDip);
}
const cropped = (capture, rect, name) => {
  const image = nativeImage
    .createFromBuffer(Buffer.from(capture.image.data, "base64"))
    .crop(cropGeometry(rect, capture));
  const size = image.getSize();
  return {
    ...capture,
    id: randomUUID(),
    region: { ...rect },
    pixelWidth: size.width,
    pixelHeight: size.height,
    image: {
      ...capture.image,
      id: randomUUID(),
      name,
      data: image.toPNG().toString("base64"),
    },
  };
};
export class DesktopCaptureService {
  constructor({
    windows = () => [],
    onCapture = () => {},
    fullPage = captureFullPage,
    companion = () => false,
    overlays = new CaptureOverlays(),
    list = windowsOn,
    permission,
    limits = {},
  } = {}) {
    // Busy must always clear: no step may hang the service for longer than this.
    this.limits = {
      run: 10 * 60_000,
      delivery: 15_000,
      page: 2 * 60_000,
      ...limits,
    };
    this.onCapture = onCapture;
    this.fullPage = fullPage;
    this.companion = companion;
    this.overlays = overlays;
    this.list = list;
    this.guard = new SurfaceGuard(() => [
      ...windows(),
      ...this.overlays.windows,
    ]);
    this.store = new IntentStore(
      join(app.getPath("userData"), "capture-intent.json"),
    );
    this.permission =
      permission ??
      (process.platform === "darwin"
        ? new PermissionRecovery({
            status: () => systemPreferences.getMediaAccessStatus("screen"),
            request: () =>
              desktopCapturer.getSources({
                types: ["screen"],
                thumbnailSize: { width: 0, height: 0 },
              }),
            store: this.store,
            restartAfterGrant: true,
            showGuide: (signal) =>
              permissionWindow(
                this.display(this.intent.displayId),
                signal,
                () => this.cancel(),
              ),
            restart: async () => {
              app.relaunch();
              app.exit(0);
            },
          })
        : null);
  }
  /** Creates the hidden overlays (one per display) before the first capture. */
  start() {
    return this.overlays.start();
  }
  display(id) {
    const display = screen
      .getAllDisplays()
      .find((d) => String(d.id) === String(id));
    if (!display) throw Error("Display no longer available");
    return display;
  }
  cancel() {
    this.controller?.abort();
  }
  async run(
    kind,
    displayId,
    signal,
    { attach = true, intent, source = "capture" } = {},
  ) {
    // One selection owns the frozen frame. Background callers check busy first.
    if (this.controller)
      throw Object.assign(Error("Capture in progress"), {
        code: "CAPTURE_BUSY",
      });
    const controller = (this.controller = new AbortController());
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    this.intent = intent ?? {
      kind,
      displayId: String(displayId),
      createdAt: Date.now(),
      version: app.getVersion(),
      restarts: 0,
    };
    const invalidate = () => {
      if (!this.matchesDisplay) return;
      const d = screen
        .getAllDisplays()
        .find((d) => String(d.id) === this.matchesDisplay.id);
      if (
        !d ||
        d.scaleFactor !== this.matchesDisplay.scaleFactor ||
        ["x", "y", "width", "height"].some(
          (k) => d.bounds[k] !== this.matchesDisplay.bounds[k],
        )
      )
        controller.abort();
    };
    screen.on("display-metrics-changed", invalidate);
    screen.on("display-removed", invalidate);
    let captures = [];
    try {
      const task = () =>
        this.guard.run(async () => {
          const display = (this.matchesDisplay = freezeDisplay(
            this.display(displayId),
          ));
          // The window list and the companion answer while the screen is read,
          // so the overlay opens with both and hover has nothing to wait for.
          const [capture, windows, companion] = await Promise.all([
            readScreen(display),
            kind === "capture" || kind === "largest" ? this.list(display) : [],
            kind === "capture" || kind === "largest"
              ? Promise.resolve(this.companion())
              : false,
          ]);
          invalidate();
          aborted(controller.signal);
          if (kind === "largest") {
            // No overlay: the biggest thing the user can see is the whole page
            // when a browser is in front and the companion can scroll it, and
            // the whole screen otherwise.
            const front = windows[0];
            if (companion && browserOf(front))
              return {
                capture,
                choice: {
                  kind: "page",
                  rect: { ...front.bounds },
                  window: front,
                  fallback: "screen",
                },
                source,
              };
            return { ...capture, kind: "screen", source };
          }
          if (kind !== "capture") return { ...capture, kind: "screen", source };
          const choice = await this.overlays.open(
            display.id,
            { capture, windows, companion: !!companion },
            controller.signal,
          );
          if (!choice) return null;
          aborted(controller.signal);
          if (choice.kind === "screen")
            return { ...capture, kind: "screen", source };
          if (choice.kind === "page") return { capture, choice };
          const named =
            choice.kind === "window" ? "Window.png" : "Selection.png";
          return {
            ...cropped(capture, choice.rect, named),
            kind: choice.kind,
            source,
          };
        }, controller.signal);
      const first = await deadline(
        this.permission
          ? this.permission.capture(task, this.intent, controller.signal)
          : task(),
        this.limits.run,
        "CAPTURE_TIMEOUT",
      );
      // The page runs after the guard, so Blink is back while the browser
      // scrolls; the frozen frame is the fallback if the companion cannot.
      captures = first?.choice
        ? await deadline(
            this.page(first, controller.signal),
            this.limits.page,
            "CAPTURE_TIMEOUT",
          )
        : first
          ? [first]
          : [];
    } catch (error) {
      if (/^CAPTURE_(DELIVERY_)?TIMEOUT$/.test(error.code)) {
        // Close any selection overlay that is still waiting, then report it.
        controller.abort();
        throw error;
      }
      if (controller.signal.aborted) return null;
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      screen.removeListener("display-metrics-changed", invalidate);
      screen.removeListener("display-removed", invalidate);
      this.controller = null;
      this.matchesDisplay = null;
      if (controller.signal.aborted) await this.store.clear();
    }
    // Delivery happens after busy has cleared: a card that is slow, closing or
    // gone must never leave later captures answering "capture in progress".
    if (attach)
      for (const capture of captures)
        await deliverCapture(this.onCapture, capture, this.limits.delivery);
    return captures[0] ?? null;
  }
  /** The whole page from the companion, one capture per tile. If the companion
   * cannot do it the picked window is taken from the frozen frame instead, so
   * the click still gives the user something. The attachment is named for what
   * it is, "Visible part", so neither the user nor Claude takes it for the page. */
  async page({ capture, choice, source = "capture" }, signal) {
    try {
      const result = await this.fullPage(signal);
      if (!result?.companionRequired)
        return (result.tiles ?? [result]).map((tile) => ({
          ...tile,
          kind: "page",
          source: "page",
        }));
    } catch (error) {
      if (signal.aborted) throw error;
    }
    // The reader asked for the whole page: the box says in one line why this
    // is only what was in view.
    if (choice.fallback === "screen")
      return [{ ...capture, kind: "screen", source, notice: "visible-part" }];
    return [
      {
        ...cropped(capture, choice.rect, "Visible part.png"),
        kind: "window",
        source: "page",
        notice: "visible-part",
      },
    ];
  }
  get busy() {
    return !!this.controller;
  }
  /** Whole-screen read for Guide and auto explain: no overlay, no choice. */
  screen(id, signal, options) {
    return this.run(options?.kind ?? "screen", id, signal, options);
  }
  /** The menu's screenshot: the whole page when a browser is in front, the
   * whole screen otherwise, with no overlay in between. */
  largest(id, signal, options) {
    return this.run("largest", id, signal, options);
  }
  /** The capture overlay: pick an area, a window, the screen or a page. */
  pick(id, signal, options) {
    return this.run("capture", id, signal, options);
  }
  async resume(onGuide = () => {}, onAuto = () => {}) {
    const intent = await this.store.read();
    if (!intent) return null;
    const displayId = screen
      .getAllDisplays()
      .some((d) => String(d.id) === intent.displayId)
      ? intent.displayId
      : String(screen.getPrimaryDisplay().id);
    const capture = await this.run(intent.kind, displayId, undefined, {
      intent: { ...intent, displayId },
      attach: !["guide", "auto-explain"].includes(intent.kind),
    });
    if (capture && intent.kind === "guide") await onGuide(capture);
    if (capture && intent.kind === "auto-explain") await onAuto(capture);
    return capture;
  }
  dispose() {
    this.cancel();
  }
}
