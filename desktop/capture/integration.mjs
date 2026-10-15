import { join } from "node:path";
import {
  app,
  screen,
  powerMonitor,
  globalShortcut,
  nativeImage,
} from "electron";
import { DesktopCaptureService, screenImage } from "./index.mjs";
import { systemLanguages } from "./windows.mjs";
import { captureText } from "./strings.mjs";
import { HotkeyRegistry, HotkeyStore, DEFAULT_HOTKEY } from "./hotkey.mjs";
import { DesktopOverlayService } from "../overlay/index.mjs";
import { GuideController } from "../overlay/guide.mjs";
import { StalenessWatch } from "../overlay/staleness.mjs";
import { maskBitmap } from "../overlay/change.mjs";
import { AutoWatch } from "../autowatch/index.mjs";
export const featureActions = new Set([
  "capture",
  "guide",
  "auto-explain",
  "guide-next",
  "guide-back",
  "guide-overview",
  "guide-dismiss",
  "guide-retry",
]);
/** Shell/composer/session builders bind only these service hooks. Feature IPC is
 * kept under the shell's existing trusted action channel, never a generic API.
 * `onCapture(taken)` gets `taken.kind` (screen, area, window, page) and
 * `taken.source` (capture, hotkey, page). `fullPage(signal, progress)` and
 * `companion()` come from the browser companion's host. `guard` says whether a
 * capture may start now and defaults to allowed. */
export function installCaptureGuide({
  blink,
  windows,
  session,
  onCapture,
  onGuide,
  onState = () => {},
  pageText,
  masks,
  busy = () => false,
  fullPage,
  companion = () => false,
  guard = () => true,
  hotkeyStore = new HotkeyStore(join(app.getPath("userData"), "hotkey.json")),
}) {
  let resolveSession;
  const sessionReady = new Promise((resolve) => {
    resolveSession = resolve;
    if (session) resolve();
  });
  const displayId = () =>
    String(screen.getDisplayMatching(blink.getBounds()).id);
  const overlay = new DesktopOverlayService({ windows, masks });
  const capture = new DesktopCaptureService({
    windows: () => [...windows(), overlay.window].filter(Boolean),
    onCapture,
    fullPage,
    companion,
  });
  // The overlays exist, hidden, before anyone asks for a capture.
  const overlaysReady = capture.start().catch(() => {});
  const guide = new GuideController({
    session,
    overlay,
    capture,
    onGuide,
    pageText,
    language: () => app.getLocale(),
  });
  const stale = new StalenessWatch({
    overlay,
    windows,
    masks,
    decode: (data, size) =>
      nativeImage
        .createFromBuffer(Buffer.from(data, "base64"))
        .resize(size)
        .toBitmap(),
    grab: async (display, size) =>
      (await screenImage(display, size)).resize(size).toBitmap(),
    onError: () => overlay.dismiss("capture-unavailable"),
  });
  let auto;
  const makeAuto = (bridge) =>
    new AutoWatch({
      session: bridge,
      capture,
      displayId,
      sample: async (id) => {
        const display = capture.display(id);
        const bitmap = (await screenImage(display, { width: 32, height: 18 }))
          .resize({ width: 32, height: 18 })
          .toBitmap();
        const excluded =
          masks?.() ??
          [...windows(), overlay.window]
            .filter((w) => w && !w.isDestroyed() && w.isVisible())
            .map((w) => {
              const b = w.getBounds();
              return {
                x: b.x - display.bounds.x,
                y: b.y - display.bounds.y,
                width: b.width,
                height: b.height,
              };
            });
        return maskBitmap(bitmap, 32, 18, display, excluded);
      },
      idleSeconds: () => powerMonitor.getSystemIdleTime(),
      busy: () => busy() || !!guide.controller || !!overlay.capture,
      onState,
    });
  auto = makeAuto(session);
  const reportError = (error) => {
    const t = captureText(systemLanguages());
    onState({
      state: "error",
      message: t(error.code === "CAPTURE_BUSY" ? "busy" : "failed"),
    });
  };
  // A failed guide already reported itself as an error bubble with a retry.
  const startGuide = (run) => run().catch(() => {});
  const take = (source) => {
    if (!guard() || capture.busy) return Promise.resolve(null);
    return capture.pick(displayId(), undefined, { source }).catch(reportError);
  };
  const hotkey = new HotkeyRegistry({
    shortcuts: globalShortcut,
    initial: DEFAULT_HOTKEY[process.platform],
    run: () => void take("hotkey"),
  });
  const hotkeyStarted = hotkeyStore.read().then((stored) => {
    hotkey.initial = stored ?? hotkey.initial;
    const started = hotkey.start();
    if (!started.ok) onState({ state: "shortcut-unavailable" });
  });
  return {
    capture,
    overlay,
    ready: Promise.all([overlaysReady, hotkeyStarted]).then(() => {}),
    get hotkey() {
      return hotkey.current;
    },
    /** ok, or {ok: false, reason: "invalid" | "clash" | "unavailable"}; a
     * refused key leaves the working one registered. */
    async setHotkey(accelerator) {
      const result = hotkey.set(accelerator);
      if (result.ok) await hotkeyStore.write(accelerator);
      return result;
    },
    guide,
    get auto() {
      return auto;
    },
    setSession(bridge) {
      const enabled = auto.enabled;
      auto.dispose();
      guide.session = bridge;
      auto = makeAuto(bridge);
      if (enabled) auto.enable();
      resolveSession();
    },
    async handle(action) {
      if (!featureActions.has(action)) return null;
      if (action === "capture") await take("capture");
      if (action === "guide") {
        if (overlay.capture || guide.controller) guide.dismiss();
        else await startGuide(() => guide.start(displayId()));
      }
      if (action === "guide-retry") await startGuide(() => guide.retry());
      if (action === "auto-explain") {
        if (auto.enabled) auto.disable();
        else auto.enable();
      }
      if (action === "guide-next") guide.next();
      if (action === "guide-back") guide.back();
      if (action === "guide-overview") guide.overview();
      if (action === "guide-dismiss") guide.dismiss();
      return { ok: true };
    },
    async resume() {
      const intent = await capture.store.read();
      if (intent && ["guide", "auto-explain"].includes(intent.kind))
        await sessionReady;
      return capture.resume(
        (c) => guide.start(c.display.id, c),
        () => auto.resume(),
      );
    },
    dispose() {
      capture.dispose();
      guide.dispose();
      auto.dispose();
      stale.dispose();
      overlay.dispose();
      hotkey.dispose();
    },
  };
}
