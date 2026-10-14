import {
  app,
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
import { selectRegion, permissionWindow, captureWindows } from "./windows.mjs";
export { selectRegion } from "./windows.mjs";
export async function screenImage(display, size) {
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
  // Flatten the native representation to the actual encoded PNG dimensions.
  return nativeImage.createFromBuffer(source.thumbnail.toPNG());
}
export async function readScreen(display) {
  const snapshot = freezeDisplay(display);
  const image = await screenImage(snapshot);
  const size = image.getSize();
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
      data: image.toPNG().toString("base64"),
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
export class DesktopCaptureService {
  constructor({
    windows = () => [],
    onCapture = () => {},
    fullPage = captureFullPage,
    permission,
    select = selectRegion,
    limits = {},
  } = {}) {
    // Busy must always clear: no step may hang the service for longer than this.
    this.limits = { run: 10 * 60_000, delivery: 15_000, ...limits };
    this.onCapture = onCapture;
    this.fullPage = fullPage;
    this.select = select;
    this.guard = new SurfaceGuard(() => [...windows(), ...captureWindows()]);
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
  async run(kind, displayId, signal, { attach = true, intent } = {}) {
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
    let capture = null;
    try {
      const task = () =>
        this.guard.run(async () => {
          this.matchesDisplay = freezeDisplay(this.display(displayId));
          const capture = await readScreen(this.matchesDisplay);
          invalidate();
          aborted(controller.signal);
          if (kind !== "region") return capture;
          const rect = await this.select(capture, controller.signal);
          if (!rect) return null;
          aborted(controller.signal);
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
              name: "Selection.png",
              data: image.toPNG().toString("base64"),
            },
          };
        }, controller.signal);
      capture = await deadline(
        this.permission
          ? this.permission.capture(task, this.intent, controller.signal)
          : task(),
        this.limits.run,
        "CAPTURE_TIMEOUT",
      );
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
    if (capture && attach)
      await deliverCapture(this.onCapture, capture, this.limits.delivery);
    return capture;
  }
  get busy() {
    return !!this.controller;
  }
  screen(id, signal, options) {
    return this.run(options?.kind ?? "screen", id, signal, options);
  }
  region(id, signal, options) {
    return this.run("region", id, signal, options);
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
