import { screen, powerMonitor, globalShortcut } from "electron";
import { DesktopCaptureService, screenImage } from "./index.mjs";
import { DesktopOverlayService } from "../overlay/index.mjs";
import { GuideController } from "../overlay/guide.mjs";
import { StalenessWatch } from "../overlay/staleness.mjs";
import { maskBitmap } from "../overlay/change.mjs";
import { AutoWatch } from "../autowatch/index.mjs";
export const featureActions = new Set([
  "screen",
  "region",
  "guide",
  "auto-explain",
  "guide-next",
  "guide-back",
  "guide-overview",
  "guide-dismiss",
]);
/** Shell/composer/session builders bind only these service hooks. Feature IPC is
 * kept under the shell's existing trusted action channel, never a generic API. */
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
  });
  const guide = new GuideController({
    session,
    overlay,
    capture,
    onGuide,
    pageText,
  });
  const stale = new StalenessWatch({
    overlay,
    windows,
    masks,
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
  const reportError = (error) =>
    onState({
      state: "error",
      message:
        error.code === "CAPTURE_BUSY"
          ? "擷取正在進行。"
          : "擷取暫時無法完成，請再試一次。",
    });
  const region = () => capture.region(displayId()).catch(reportError);
  const shortcut = globalShortcut.register("CommandOrControl+Shift+S", region);
  if (!shortcut) onState({ state: "shortcut-unavailable" });
  // Shift inside Blink enters selection. A bare global Shift would hijack typing
  // in other apps; the global shortcut supplies the any-app path in the brief.
  const input = (_e, key) => {
    if (key.type === "keyDown" && key.key === "Shift" && !capture.busy)
      void region();
  };
  const contents = blink.webContents;
  contents.on("before-input-event", input);
  return {
    capture,
    overlay,
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
      if (action === "screen") await capture.screen(displayId());
      if (action === "region") await capture.region(displayId());
      if (action === "guide") {
        if (overlay.capture || guide.controller) guide.dismiss();
        else await guide.start(displayId());
      }
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
      contents.removeListener("before-input-event", input);
      if (shortcut) globalShortcut.unregister("CommandOrControl+Shift+S");
    },
  };
}
