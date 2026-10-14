import { launchExtensionContext } from "./browser";
import { nativeControls } from "./native-permission";
import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import type { PendingWebCapture } from "../extension/capture";
import { ExtensionBridge } from "../bridge/src/extension-bridge";
import { ExtensionSessions } from "../bridge/src/extension-sessions";
import { runCliProvider } from "../bridge/src/provider-cli";
import type { ProviderRequest } from "../bridge/src/provider-request";
import en from "../extension/locales/en.json" with { type: "json" };

// XTest sends genuine desktop input, including to the native PiP window. CDP
// input and document.fullscreenElement alone cannot establish these regressions.
const xInput = `import ctypes,sys
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.restype=ctypes.c_void_p
p=x.XOpenDisplay(None)
if not p: raise RuntimeError('No X11 display')
x.XSync.argtypes=[ctypes.c_void_p,ctypes.c_int]
x.XCloseDisplay.argtypes=[ctypes.c_void_p]
x.XStringToKeysym.argtypes=[ctypes.c_char_p];x.XStringToKeysym.restype=ctypes.c_ulong
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XKeysymToKeycode.restype=ctypes.c_uint
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
if sys.argv[1]=='pointer':
 t.XTestFakeMotionEvent(p,-1,int(sys.argv[2]),int(sys.argv[3]),0)
 if sys.argv[4]!='move': t.XTestFakeButtonEvent(p,1,int(sys.argv[4]=='down'),0)
elif sys.argv[1]=='click':
 t.XTestFakeMotionEvent(p,-1,int(sys.argv[2]),int(sys.argv[3]),0)
 t.XTestFakeButtonEvent(p,1,1,0);t.XTestFakeButtonEvent(p,1,0,0)
elif sys.argv[1]=='chord':
 keys=[x.XKeysymToKeycode(p,x.XStringToKeysym(name.encode())) for name in sys.argv[2:]]
 for k in keys: t.XTestFakeKeyEvent(p,k,1,0)
 for k in reversed(keys): t.XTestFakeKeyEvent(p,k,0,0)
elif sys.argv[1] in ['key-down','key-up']:
 k=x.XKeysymToKeycode(p,x.XStringToKeysym(sys.argv[2].encode()))
 t.XTestFakeKeyEvent(p,k,int(sys.argv[1]=='key-down'),0)
else:
 for name in sys.argv[2:]:
  k=x.XKeysymToKeycode(p,x.XStringToKeysym(name.encode()))
  t.XTestFakeKeyEvent(p,k,1,0);t.XTestFakeKeyEvent(p,k,0,0)
x.XSync(p,0)
x.XCloseDisplay(p)
`;

let desktop: ChildProcess;
let manager: ChildProcess;
let context: BrowserContext;
let panel: Page;
let site: Page;
let directory: string;
let display: string;
let previousTabId: number;
let desktopLog: string;
let managerLog: string;
let authorizationServer: Server | undefined;
let authorizationTabId: number;
let autoBridge: ExtensionBridge | undefined;
let autoRequests: { at: number; request: ProviderRequest }[] = [];
// Provider timestamps include encoding and bridge transport. The exact ten-second
// detector boundary is checked in screen-change.test.ts.
const autoRequestTimingTolerance = 100;
let autoOrigin = "";
let autoTabId: number;
let narrationApp: ChildProcess | undefined;
const nativeNarrationApp = `import ctypes, sys, select
x = ctypes.CDLL('libX11.so.6'); P = ctypes.c_void_p; U = ctypes.c_ulong; I = ctypes.c_int
x.XOpenDisplay.restype = P
d = x.XOpenDisplay(None)
if not d: raise RuntimeError('No display')
x.XDefaultScreen.argtypes = [P]; x.XDefaultScreen.restype = I
screen = x.XDefaultScreen(d)
x.XRootWindow.argtypes = [P,I]; x.XRootWindow.restype = U
root = x.XRootWindow(d,screen)
x.XCreateSimpleWindow.argtypes = [P,U,I,I,ctypes.c_uint,ctypes.c_uint,ctypes.c_uint,U,U]; x.XCreateSimpleWindow.restype = U
w = x.XCreateSimpleWindow(d,root,40,100,900,600,0,0,0)
x.XStoreName.argtypes = [P,U,ctypes.c_char_p]; x.XStoreName(d,w,b'Blinkling narration app')
x.XMapWindow.argtypes = [P,U]; x.XMapWindow(d,w)
x.XCreateGC.argtypes = [P,U,U,P]; x.XCreateGC.restype = P
gc = x.XCreateGC(d,w,0,None)
x.XSetForeground.argtypes = [P,P,U]
x.XFillRectangle.argtypes = [P,U,P,I,I,ctypes.c_uint,ctypes.c_uint]
x.XFlush.argtypes = [P]
reverse = False
while True:
 for i in range(16):
  gray = (15-i if reverse else i)*17
  x.XSetForeground(d,gc,gray*0x010101)
  x.XFillRectangle(d,w,gc,i*57,0,57,600)
 x.XFlush(d)
 if select.select([sys.stdin],[],[],0.2)[0]:
  line = sys.stdin.readline()
  if not line: break
  reverse = not reverse
`;

async function stopProcess(child: ChildProcess, group = false) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const exited = once(child, "exit");
  if (group) process.kill(-child.pid, "SIGTERM");
  else child.kill();
  await exited;
}

type NativeFixture = Window & {
  result?: string | null;
  failure?: string;
  useClearBubble?: boolean;
  useNativeClearBubble?: boolean;
  restoreCount: number;
  stopShare: () => void;
  captureWeb: typeof import("../extension/capture").captureWeb;
  retryPendingWebCapture: typeof import("../extension/capture").retryPendingWebCapture;
  setCurrentActiveTab: typeof import("../extension/capture").setCurrentActiveTab;
  pending?: PendingWebCapture;
  resetDecoderForCrop?: boolean;
  decoderReset?: { dimensions: number[]; track: string };
};

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  const path = testInfo.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2));
  await testInfo.attach(name, { path, contentType: "application/json" });
}

async function attachFrame(testInfo: TestInfo, name: string, frame: Buffer) {
  const path = testInfo.outputPath(`${name}.png`);
  await writeFile(path, frame);
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function evaluateWithoutGesture<T>(expression: string): Promise<T> {
  const session = await context.newCDPSession(panel);
  try {
    const { result, exceptionDetails } = await session.send(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: false,
      },
    );
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
    return result.value as T;
  } finally {
    await session.detach();
  }
}

async function waitForInactiveCaptureGesture() {
  // Playwright evaluate marks calls as user gestures. Let earlier activation
  // expire and inspect it through CDP without manufacturing another gesture.
  await expect
    .poll(
      () =>
        evaluateWithoutGesture<boolean>("navigator.userActivation.isActive"),
      { timeout: 10000 },
    )
    .toBe(false);
}

function nativeInput(...args: string[]) {
  execFileSync("python3", ["-c", xInput, ...args], {
    env: { ...process.env, DISPLAY: display },
  });
}

async function answerPermission(outcome: "Allow" | "Deny", testInfo: TestInfo) {
  const path = testInfo.outputPath(`capture-permission-${outcome}.png`);
  let controls: ReturnType<typeof nativeControls> = [];
  await expect
    .poll(
      () => {
        execFileSync(
          "ffmpeg",
          [
            "-y",
            "-loglevel",
            "error",
            "-f",
            "x11grab",
            "-i",
            display,
            "-frames:v",
            "1",
            path,
          ],
          { timeout: 10000 },
        );
        controls = nativeControls(path);
        return controls.map((control) => control.name).sort();
      },
      { timeout: 15000 },
    )
    .toEqual(["Allow", "Deny"]);
  await testInfo.attach(`capture-permission-${outcome}`, {
    path,
    contentType: "image/png",
  });
  await attachJson(
    testInfo,
    `capture-permission-${outcome}-controls`,
    controls,
  );
  const control = controls.find((control) => control.name === outcome)!;
  nativeInput(
    "click",
    String(Math.round(control.x + control.width / 2)),
    String(Math.round(control.y + control.height / 2)),
  );
}

async function nativeClick(selector: string, bubble = false) {
  if (!bubble) await panel.bringToFront();
  await expect
    .poll(() =>
      panel.evaluate(
        ({ bubble, selector }) => {
          const view = bubble
            ? window.documentPictureInPicture.window ||
              chrome.extension
                .getViews()
                .find((view) => view.location.search.includes("surfaceOnly=1"))
            : window;
          return Boolean(view?.document.querySelector(selector));
        },
        { bubble, selector },
      ),
    )
    .toBe(true);
  await panel.evaluate(
    async ({ bubble, selector }) => {
      const view = bubble
        ? (window.documentPictureInPicture.window ||
            chrome.extension
              .getViews()
              .find((view) => view.location.search.includes("surfaceOnly=1")))!
        : window;
      // PiP is already above the page. Focusing it programmatically can raise
      // its fullscreen opener before the real mouse click reaches the bubble.
      if (!bubble || !window.documentPictureInPicture.window) view.focus();
      view.document
        .querySelector(selector)!
        .scrollIntoView({ block: "center" });
      // A newly activated Chrome target can report its initial tiny viewport
      // until its first compositor paint. Native input needs the painted layout.
      await new Promise<void>((resolve) =>
        view.requestAnimationFrame(() =>
          view.requestAnimationFrame(() => resolve()),
        ),
      );
    },
    { bubble, selector },
  );
  await expect
    .poll(() =>
      panel.evaluate((bubble) => {
        const view = bubble
          ? (window.documentPictureInPicture.window ||
              chrome.extension
                .getViews()
                .find((view) =>
                  view.location.search.includes("surfaceOnly=1"),
                ))!
          : window;
        return (
          (bubble && Boolean(window.documentPictureInPicture.window)) ||
          view.document.hasFocus()
        );
      }, bubble),
    )
    .toBe(true);
  let previous: string | undefined;
  let point = { x: 0, y: 0 };
  // Newly created native windows can still be decorated/repositioned. Require
  // stable geometry before translating the DOM rectangle into desktop input.
  await expect
    .poll(async () => {
      point = await panel.evaluate(
        ({ selector, bubble }) => {
          const view = bubble
            ? (window.documentPictureInPicture.window ||
                chrome.extension
                  .getViews()
                  .find((view) =>
                    view.location.search.includes("surfaceOnly=1"),
                  ))!
            : window;
          const rect = view.document
            .querySelector(selector)!
            .getBoundingClientRect();
          return {
            x:
              (view.screenX +
                (view.outerWidth - view.innerWidth) / 2 +
                rect.x +
                rect.width / 2) *
              view.devicePixelRatio,
            y:
              (view.screenY +
                view.outerHeight -
                view.innerHeight +
                rect.y +
                rect.height / 2) *
              view.devicePixelRatio,
          };
        },
        { selector, bubble },
      );
      const current = JSON.stringify(point);
      const stable = previous === current;
      previous = current;
      return stable;
    })
    .toBe(true);
  nativeInput(
    "pointer",
    String(Math.round(point.x)),
    String(Math.round(point.y)),
    "move",
  );
  await expect
    .poll(() =>
      panel.evaluate(
        ({ selector, bubble }) => {
          const view = bubble
            ? (window.documentPictureInPicture.window ||
                chrome.extension
                  .getViews()
                  .find((view) =>
                    view.location.search.includes("surfaceOnly=1"),
                  ))!
            : window;
          return (
            view.document.hasFocus() &&
            view.document.visibilityState === "visible" &&
            view.document.querySelector(selector)!.matches(":hover")
          );
        },
        { selector, bubble },
      ),
    )
    .toBe(true);
  nativeInput(
    "click",
    String(Math.round(point.x)),
    String(Math.round(point.y)),
  );
  await panel.evaluate(
    (click) => {
      (window as Window & { lastNativeClick?: unknown }).lastNativeClick =
        click;
    },
    { selector, bubble, point, display },
  );
}

test.beforeEach(async ({ browserName }, testInfo) => {
  expect(browserName).toBe("chromium");
  directory = await mkdtemp(join(tmpdir(), "blinkling-native-screen-"));
  desktop = spawn(
    "Xvfb",
    ["-displayfd", "3", "-screen", "0", "1440x1000x24", "-ac"],
    { stdio: ["ignore", "ignore", "pipe", "pipe"] },
  );
  desktopLog = "";
  desktop.stderr!.on("data", (data) => (desktopLog += String(data)));
  const [number] = await once(desktop.stdio[3]!, "data");
  display = `:${String(number).trim()}`;
  // A private X server also needs a private session bus. Sharing the host's bus
  // lets separate xfwm4 instances contend for the same session registration.
  manager = spawn(
    "dbus-run-session",
    ["--", "xfwm4", "--replace", "--compositor=off"],
    {
      env: { ...process.env, DISPLAY: display },
      stdio: ["ignore", "ignore", "pipe"],
      detached: true,
    },
  );
  managerLog = "";
  manager.stderr!.on("data", (data) => (managerLog += String(data)));
  // Wait for EWMH ownership before Chrome starts. Otherwise the manager can
  // decorate/reposition its windows between measuring and sending native input.
  await expect
    .poll(() => {
      if (manager.exitCode !== null || manager.signalCode !== null)
        throw new Error(`Window manager exited before startup: ${managerLog}`);
      return execFileSync("xprop", ["-root", "_NET_SUPPORTING_WM_CHECK"], {
        env: { ...process.env, DISPLAY: display },
      }).toString();
    })
    .toMatch(/window id # 0x[1-9a-f]/);
  execFileSync("xsetroot", ["-solid", "#125a9c"], {
    env: { ...process.env, DISPLAY: display },
  });
  const extension = join(directory, "extension");
  await cp(resolve("dist-extension"), extension, { recursive: true });
  await writeFile(
    join(extension, "native-fixture.html"),
    `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#8b284d}button{padding:20px;margin:20px}video{position:fixed;width:1px;height:1px;opacity:0;pointer-events:none}</style><button id="float">Float</button><button id="reopen" hidden>Reopen bubble</button><script src="native-fixture.js"></script>`,
  );
  await build({
    stdin: {
      resolveDir: resolve("extension"),
      contents: `
import { cropSharedScreen } from './screen-crop';
import { freezeSharedFrame } from './screen-frame';
import { nativeBubbleClearance } from './native-bubble';
import { listenForShiftCrop } from './shift-crop';
import * as captureApi from './capture';
window.captureWeb = captureApi.captureWeb;
window.retryPendingWebCapture = captureApi.retryPendingWebCapture;
window.setCurrentActiveTab = captureApi.setCurrentActiveTab;
window.nativeBubbleClearance = (floating) => nativeBubbleClearance(floating, {
  close: () => { document.body.append(controls); controls.hidden = true; floating.close(); },
  open: async () => { const replacement = await open(); controls.hidden = false; return replacement; },
});
window.fixtureEvents = [];
window.addEventListener('unhandledrejection', (event) => {
  window.fixtureEvents.push({ type: 'unhandledrejection', error: String(event.reason) });
});
window.addEventListener('error', (event) => {
  window.fixtureEvents.push({ type: 'error', error: event.message });
});

const labels = {
  cropTitle: 'Crop', cropHint: 'Drag. Enter to confirm. Esc to cancel.',
  cropConfirm: 'Confirm', cropCancel: 'Cancel',
};
let pip, video, controls;
async function open() {
  pip = await window.documentPictureInPicture.requestWindow({ width: 380, height: 320 });
  if (!controls) {
    controls = document.createElement('div');
    controls.innerHTML = '<style>body{margin:0;background:#fff8eb}button{padding:14px;margin:8px}textarea{margin:8px}</style><textarea id="draft">Keep this conversation</textarea><button id="resize">Compact</button><button id="share">Share a screen</button><button id="crop">Selected area</button><button id="frame">Capture frame</button>';
    controls.querySelector('#resize').onclick = () => pip.resizeTo(380, 320);
    controls.querySelector('#share').onclick = async (event) => {
      window.fixtureEvents.push({ type: 'share-click', trusted: event.isTrusted, focus: pip.document.hasFocus(), activation: navigator.userActivation.isActive });
      // Match captureScreen: the share belongs to the opener, not the PiP
      // document that this fallback will close. Keep its video there as well.
      const stream = ${testInfo.title.includes("first share")}
        ? (await captureApi.startScreenShare()).stream
        : await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 2, displaySurface: 'monitor' }, audio: false,
          });
      video = document.createElement('video');
      video.srcObject = stream;
      document.body.append(video);
      await video.play();
      window.ready = true;
    };
    controls.querySelector('#crop').onclick = startCrop;
    controls.querySelector('#frame').onclick = startFrame;
  }
  pip.document.body.append(controls);
  listenForShiftCrop(pip, () => Boolean(video), startCrop);
  return pip;
}
document.querySelector('#float').onclick = open;
window.restoreCount = 0;
const clearBubble = {
  hide: async () => {
    document.body.append(controls);
    controls.hidden = true;
    pip.close();
  },
  restore: async () => {
    const tab = await chrome.tabs.getCurrent();
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return new Promise((resolve, reject) => {
      const button = document.querySelector('#reopen');
      button.hidden = false;
      button.onclick = async () => {
        try {
          // requestWindow runs directly in the native click's user activation.
          await open();
          controls.hidden = false;
          button.hidden = true;
          window.restoreCount++;
          resolve();
        } catch (error) { reject(error); }
      };
    });
  },
};
const options = () => window.useNativeClearBubble
  ? { clearBubble: window.nativeBubbleClearance(pip) }
  : window.useClearBubble ? { clearBubble } : undefined;
function startCrop() {
  window.result = undefined;
  window.failure = undefined;
  if (window.resetDecoderForCrop) {
    // Reattaching the genuine live stream resets decoder metadata. ImageCapture
    // must still read this track while the decoder catches up after reopening.
    const stream = video.srcObject;
    video.srcObject = null;
    video.srcObject = stream;
    window.decoderReset = { dimensions: [video.videoWidth, video.videoHeight], track: stream.getVideoTracks()[0].readyState };
    void video.play();
  }
  cropSharedScreen(video, window.useClearBubble || window.useNativeClearBubble ? pip.document : null, labels, options())
    .then(value => window.result = value, error => window.failure = error.message);
}
function startFrame() {
  window.result = undefined;
  window.failure = undefined;
  freezeSharedFrame(video, pip.document, options()).then(frame => {
    window.result = frame.toDataURL();
    frame.width = 0;
    frame.height = 0;
  }, error => window.failure = error.message);
}
window.startCrop = startCrop;
window.startFrame = startFrame;
window.stopShare = () => video.srcObject.getTracks().forEach(track => {
  track.stop(); track.dispatchEvent(new Event('ended'));
});
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'blinkling:command' && message.command === 'crop-screen') startCrop();
});`,
      loader: "js",
    },
    bundle: true,
    outfile: join(extension, "native-fixture.js"),
    format: "iife",
    target: "chrome116",
  });
  const dpi = testInfo.title.includes("HiDPI") ? 2 : 1;
  context = await launchExtensionContext(join(directory, "profile"), {
    headless: false,
    viewport: null,
    env: { ...process.env, DISPLAY: display },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
      "--enable-unsafe-extension-debugging",
      "--window-position=0,0",
      ...(testInfo.title.includes("v2.1") ||
      testInfo.title.includes("automatic explanation")
        ? []
        : ["--window-size=1200,900"]),
      `--force-device-scale-factor=${dpi}`,
      ...(testInfo.title.includes("real picker")
        ? []
        : testInfo.title.includes("v2.1 browser")
          ? ["--auto-select-tab-capture-source-by-title=Native work page"]
          : testInfo.title.includes("automatic explanation tab")
            ? ["--auto-select-tab-capture-source-by-title=Auto explain source"]
            : testInfo.title.includes("automatic explanation app")
              ? ["--auto-select-desktop-capture-source=Blinkling narration app"]
              : ["--auto-select-desktop-capture-source=Entire screen"]),
      "--host-resolver-rules=MAP *.blinkling.test 127.0.0.1",
      "--no-proxy-server",
      ...(testInfo.title.includes("v2.1 dark") ? ["--force-dark-mode"] : []),
      ...(testInfo.title.includes("dedicated")
        ? ["--enable-features=ExcludePipFromScreenCapture"]
        : ["--disable-features=ExcludePipFromScreenCapture"]),
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(
    (automatic) =>
      chrome.storage.local.set({
        consented: true,
        locale: "en",
        ...(automatic ? { blocklist: ["blocked.blinkling.test"] } : {}),
      }),
    testInfo.title.includes("automatic explanation"),
  );
  panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${new URL(worker.url()).host}/native-fixture.html`,
  );
  if (testInfo.title.includes("v2.1")) return;
  if (testInfo.title.includes("automatic explanation")) {
    autoRequests = [];
    authorizationServer = createServer((request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      const path = new URL(request.url || "/", "http://localhost").pathname;
      response.end(`<!doctype html><title>Auto explain source</title>
        <style>html{background:linear-gradient(90deg,${path === "/next" ? "#fff,#000" : "#000,#fff"});color:#f44;min-height:250vh}p{font-size:40px}</style>
        <p>Public document ${["/next", "/cross"].includes(path) ? "NEW_DOCUMENT_ONLY" : "ORIGINAL_DOCUMENT_ONLY"}</p>
        ${path === "/password" ? '<input type="password" value="PRIVATE_PASSWORD">' : ""}
        ${path === "/embedded" ? `<iframe src="http://localhost:${new URL(autoOrigin).port}/opaque"></iframe>` : ""}`);
    });
    autoBridge = new ExtensionBridge(authorizationServer, () => autoOrigin, {
      provider: (request) => {
        autoRequests.push({ at: performance.now(), request });
        return runCliProvider(request, {
          command: process.execPath,
          argsPrefix: [resolve("e2e-extension/mock-claude.cjs")],
        });
      },
      sessions: new ExtensionSessions(directory, async () => []),
    });
    authorizationServer.listen(0, "127.0.0.1");
    await once(authorizationServer, "listening");
    const address = authorizationServer.address();
    if (!address || typeof address === "string")
      throw new Error("Missing auto fixture port");
    autoOrigin = `http://127.0.0.1:${address.port}`;
    site = await context.newPage();
    await site.goto(`${autoOrigin}/`);
    autoTabId = await panel.evaluate(
      async (url) => (await chrome.tabs.query({ url }))[0].id!,
      site.url(),
    );
    await panel.goto(
      `chrome-extension://${new URL(worker.url()).host}/panel.html?sourceTab=${autoTabId}&pairPort=${address.port}&pairCode=${autoBridge.issueCode()}`,
    );
    await expect(panel.locator(".connection")).toHaveClass(/online/);
    await expect(panel.locator(".suggestions button")).toHaveCount(3);
    await nativeClick(`button[aria-label="${en.float}"]`);
    await expect
      .poll(() =>
        panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
      )
      .toBe(true);
    await site.bringToFront();
    if (testInfo.title.includes("automatic explanation app")) {
      narrationApp = spawn("python3", ["-u", "-c", nativeNarrationApp], {
        env: { ...process.env, DISPLAY: display },
        stdio: ["pipe", "ignore", "pipe"],
      });
      await expect
        .poll(() =>
          execFileSync("xwininfo", ["-root", "-tree"], {
            env: { ...process.env, DISPLAY: display },
          }).toString(),
        )
        .toContain("Blinkling narration app");
    }
    return;
  }
  if (testInfo.title.includes("web authorization")) {
    authorizationServer = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><title>Authorization crop fixture</title>
        <style>html,body{margin:0;min-height:100vh;background:#125a9c}#patch{position:absolute;left:80px;top:110px;width:60px;height:50px;background:#ffeecc}</style>
        <div id="patch"></div><p>Public screenshot fixture</p>`);
    });
    authorizationServer.listen(0, "127.0.0.1");
    await once(authorizationServer, "listening");
    const address = authorizationServer.address();
    if (!address || typeof address === "string")
      throw new Error("Missing authorization fixture port");
    site = await context.newPage();
    const freshSite = testInfo.title.includes("grants once");
    await site.goto(
      `http://${freshSite ? "capture.blinkling.test" : "127.0.0.1"}:${address.port}/`,
    );
    authorizationTabId = await panel.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      (window as NativeFixture).setCurrentActiveTab(tab.id!);
      return tab.id!;
    }, site.url());
    await site.bringToFront();
    await expect
      .poll(() => site.evaluate(() => innerWidth > 500 && innerHeight > 400))
      .toBe(true);
    const access = await panel.evaluate(
      async (url) => ({
        site: await chrome.permissions.contains({
          origins: [`${new URL(url).origin}/*`],
        }),
        allSites: await chrome.permissions.contains({
          origins: ["<all_urls>"],
        }),
      }),
      site.url(),
    );
    expect(access).toEqual({ site: !freshSite, allSites: false });
    return;
  }
  await nativeClick("#float");
  await expect
    .poll(() =>
      panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
    )
    .toBe(true);
  await nativeClick("#resize", true);
  await expect
    .poll(() =>
      panel.evaluate(() => window.documentPictureInPicture.window!.outerWidth),
    )
    .toBe(380);
  await nativeClick("#share", true);
  await expect
    .poll(() =>
      panel.evaluate(() => (window as unknown as { ready: boolean }).ready),
    )
    .toBe(true);
  expect(
    await panel.evaluate(() => {
      const video = document.querySelector("video")!;
      return [
        video.videoWidth,
        video.videoHeight,
        (video.srcObject as MediaStream).getVideoTracks()[0].getSettings()
          .displaySurface,
      ];
    }),
  ).toEqual([1440, 1000, "monitor"]);
  const previousOpened = context.waitForEvent("page");
  const previousTab = await panel.evaluate(async () => {
    const opener = await chrome.tabs.getCurrent();
    return chrome.tabs.create({
      windowId: opener!.windowId,
      url: "data:text/html,<title>Previous tab</title>Keep this tab active",
      active: true,
    });
  });
  const previousPage = await previousOpened;
  await previousPage.waitForLoadState();
  previousTabId = previousTab.id!;
  const sourceOpened = context.waitForEvent("page");
  const sourceWindow = await panel.evaluate(() =>
    chrome.windows.create({
      url: 'data:text/html,<title>Other app</title><style>body{background:%23125a9c}</style><h1>Work in another app</h1><div style="position:fixed;left:40px;top:120px;width:120px;height:100px;background:white"></div><div style="position:fixed;right:2vw;bottom:2vh;width:2vw;height:2vh;background:white"></div>',
      state: "fullscreen",
      focused: true,
    }),
  );
  site = await sourceOpened;
  await site.waitForLoadState();
  expect(await site.title()).toBe("Other app");
  await panel.evaluate(
    (id) => chrome.windows.update(id, { state: "fullscreen", focused: true }),
    sourceWindow!.id!,
  );
  await site.bringToFront();
  const before = testInfo.outputPath("desktop-before.png");
  execFileSync(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-video_size",
      "1440x1000",
      "-i",
      display,
      "-frames:v",
      "1",
      before,
    ],
    { timeout: 10000 },
  );
  await testInfo.attach("native-before", {
    path: before,
    contentType: "image/png",
  });
  await attachJson(
    testInfo,
    "windows-before",
    await panel.evaluate(() => chrome.windows.getAll({ populate: true })),
  );
  await expect
    .poll(() =>
      panel.evaluate(() => {
        const video = document.querySelector("video");
        const canvas = document.createElement("canvas");
        canvas.width = 1440;
        canvas.height = 1000;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);
        return [...ctx.getImageData(1360, 920, 1, 1).data];
      }),
    )
    .toEqual([17, 90, 154, 255]);
});

test("ordinary first share keeps the native bubble open without requesting recovery", async ({
  browserName,
}) => {
  expect(browserName).toBe("chromium");
  const state = await panel.evaluate(async () => {
    const pip = window.documentPictureInPicture.window;
    const windows = await chrome.windows.getAll();
    const video = document.querySelector("video")!;
    return {
      open: Boolean(pip && !pip.closed),
      native: windows.filter((entry) => entry.alwaysOnTop).length,
      draft: pip?.document.querySelector<HTMLTextAreaElement>("#draft")?.value,
      recoveries: (window as NativeFixture).restoreCount,
      recoveryVisible:
        !document.querySelector<HTMLButtonElement>("#reopen")!.hidden,
      track: (video.srcObject as MediaStream).getVideoTracks()[0].readyState,
    };
  });
  expect(state).toEqual({
    open: true,
    native: 1,
    draft: "Keep this conversation",
    recoveries: 0,
    recoveryVisible: false,
    track: "live",
  });
});

test("ordinary native clearance preserves an intervening foreground window when restoring the bubble", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await nativeClick("#draft", true);
  await panel.evaluate(async () => {
    const fixture = window as Window & {
      nativeBubbleClearance: typeof import("../extension/native-bubble").nativeBubbleClearance;
      pendingClearance?: ReturnType<
        typeof import("../extension/native-bubble").nativeBubbleClearance
      >;
    };
    fixture.pendingClearance = fixture.nativeBubbleClearance(
      window.documentPictureInPicture.window!,
    );
    await fixture.pendingClearance.hide();
  });
  const foreground = await panel.evaluate(() =>
    chrome.windows.create({
      url: "data:text/html,<title>Intervening foreground app</title><input autofocus>",
      type: "normal",
      width: 700,
      height: 500,
      focused: true,
    }),
  );
  await expect
    .poll(() =>
      panel.evaluate(
        async () =>
          (await chrome.windows.getAll()).find((native) => native.focused)?.id,
      ),
    )
    .toBe(foreground.id);
  const before = await panel.evaluate(() => chrome.windows.getAll());
  await panel.evaluate(async () => {
    await (
      window as Window & { pendingClearance: { restore: () => Promise<void> } }
    ).pendingClearance.restore();
  });
  await panel.waitForTimeout(250);
  const after = await panel.evaluate(() => chrome.windows.getAll());
  await attachJson(testInfo, "intervening-window-focus", { before, after });
  expect(after.find((native) => native.focused)?.id).toBe(foreground.id);
  expect(after.find((native) => native.id === foreground.id)).toEqual(
    before.find((native) => native.id === foreground.id),
  );
});

test("native crop cancellation preserves a window brought forward during selection", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await panel.evaluate(() => {
    (window as NativeFixture).useNativeClearBubble = true;
  });
  await nativeClick("#crop", true);
  await expect(
    panel.locator("[data-blinkling-frozen-crop] .surface"),
  ).toBeVisible();
  const foreground = await panel.evaluate(() =>
    chrome.windows.create({
      url: "data:text/html,<title>Keep this window focused</title><input autofocus>",
      type: "normal",
      width: 700,
      height: 500,
      focused: true,
    }),
  );
  await expect
    .poll(() =>
      panel.evaluate(
        async () => (await chrome.windows.getAll()).find((w) => w.focused)?.id,
      ),
    )
    .toBe(foreground.id);
  const before = await panel.evaluate(() => chrome.windows.getAll());
  await evaluateWithoutGesture("window.stopShare()");
  await expect
    .poll(() => panel.evaluate(() => (window as NativeFixture).failure))
    .toBe("share_ended");
  await expect(panel.locator("[data-blinkling-frozen-crop]")).toHaveCount(0);
  await expect
    .poll(() =>
      panel.evaluate(
        async () => (await chrome.windows.getAll()).find((w) => w.focused)?.id,
      ),
    )
    .toBe(foreground.id);
  const after = await panel.evaluate(() => chrome.windows.getAll());
  await attachJson(testInfo, "intervening-crop-window-focus", {
    before,
    after,
  });
  expect(after.find((w) => w.id === foreground.id)).toEqual(
    before.find((w) => w.id === foreground.id),
  );
  expect(
    await panel.evaluate(() =>
      Boolean(
        window.documentPictureInPicture.window &&
          !window.documentPictureInPicture.window.closed,
      ),
    ),
  ).toBe(true);
});

test("native global command crops from a non-browser app after prior activation expires", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await panel.evaluate(() => {
    (window as NativeFixture).useNativeClearBubble = true;
  });
  const app = spawn(
    "xmessage",
    [
      "-title",
      "Global crop source",
      "-geometry",
      "400x200+600+350",
      "Crop from here",
    ],
    {
      env: { ...process.env, DISPLAY: display },
      stdio: "ignore",
    },
  );
  try {
    await expect
      .poll(() => {
        const active = execFileSync("xprop", ["-root", "_NET_ACTIVE_WINDOW"], {
          env: { ...process.env, DISPLAY: display },
        })
          .toString()
          .match(/0x[0-9a-f]+/)?.[0];
        return (
          active &&
          execFileSync("xprop", ["-id", active, "WM_CLASS"], {
            env: { ...process.env, DISPLAY: display },
          }).toString()
        );
      })
      .toContain("Xmessage");
    await waitForInactiveCaptureGesture();
    nativeInput("chord", "Control_L", "Shift_L", "7");
    await expect(
      panel.locator("[data-blinkling-frozen-crop] .surface"),
    ).toBeVisible();
    await recordFullscreen(testInfo);
    await panel.waitForTimeout(5500);
    nativeInput("keys", "Escape");
    await expect
      .poll(() => panel.evaluate(() => (window as NativeFixture).result))
      .toBeNull();
    expect(
      await panel.evaluate(() =>
        Boolean(
          window.documentPictureInPicture.window &&
            !window.documentPictureInPicture.window.closed,
        ),
      ),
    ).toBe(true);
    expect(
      await panel.evaluate(
        () => document.querySelector<HTMLButtonElement>("#reopen")!.hidden,
      ),
    ).toBe(true);
  } finally {
    await stopProcess(app);
  }
});

test("ordinary native clearance returns focus to an intervening non-browser app", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await nativeClick("#draft", true);
  await panel.evaluate(async () => {
    const fixture = window as Window & {
      nativeBubbleClearance: typeof import("../extension/native-bubble").nativeBubbleClearance;
      pendingClearance?: ReturnType<
        typeof import("../extension/native-bubble").nativeBubbleClearance
      >;
    };
    fixture.pendingClearance = fixture.nativeBubbleClearance(
      window.documentPictureInPicture.window!,
    );
    await fixture.pendingClearance.hide();
  });
  const app = spawn(
    "xmessage",
    [
      "-title",
      "Intervening native app",
      "-geometry",
      "400x200+40+60",
      "Keep focus here",
    ],
    { env: { ...process.env, DISPLAY: display }, stdio: "ignore" },
  );
  const activeNativeWindow = () =>
    execFileSync("xprop", ["-root", "_NET_ACTIVE_WINDOW"], {
      env: { ...process.env, DISPLAY: display },
    })
      .toString()
      .trim();
  try {
    await expect
      .poll(() => {
        const id = activeNativeWindow().match(/0x[0-9a-f]+/)?.[0];
        return (
          id &&
          execFileSync("xprop", ["-id", id, "WM_CLASS"], {
            env: { ...process.env, DISPLAY: display },
          }).toString()
        );
      })
      .toContain("Xmessage");
    const before = activeNativeWindow();
    await evaluateWithoutGesture("window.pendingClearance.restore()");
    await panel.waitForTimeout(250);
    const after = activeNativeWindow();
    await attachJson(testInfo, "intervening-native-app-focus", {
      before,
      after,
    });
    test.fail(
      true,
      "Chromium X11 lowers an always-on-top PiP on deactivation without returning native focus to another app. Extension APIs cannot focus non-browser windows.",
    );
    expect(after).toBe(before);
  } finally {
    await stopProcess(app);
  }
});

test.afterEach(async ({ browserName }, testInfo) => {
  try {
    if (
      testInfo.status !== testInfo.expectedStatus &&
      panel &&
      !panel.isClosed()
    ) {
      await attachJson(
        testInfo,
        "failure-state",
        await panel.evaluate(() => {
          const pip = window.documentPictureInPicture.window;
          const video = document.querySelector("video");
          return {
            pip: pip && {
              closed: pip.closed,
              text: pip.document.body.innerText,
            },
            opener: document.body.innerText,
            click: (window as Window & { lastNativeClick?: unknown })
              .lastNativeClick,
            events: (window as Window & { fixtureEvents?: unknown })
              .fixtureEvents,
            decoderReset: (window as NativeFixture).decoderReset,
            video: video && {
              width: video.videoWidth,
              height: video.videoHeight,
              readyState: video.readyState,
              paused: video.paused,
              time: video.currentTime,
              track: (video.srcObject as MediaStream | null)
                ?.getVideoTracks()[0]
                ?.getSettings(),
            },
          };
        }),
      );
      const image = testInfo.outputPath("desktop-failure.png");
      execFileSync(
        "ffmpeg",
        [
          "-loglevel",
          "error",
          "-f",
          "x11grab",
          "-video_size",
          "1440x1000",
          "-i",
          display,
          "-frames:v",
          "1",
          image,
        ],
        { timeout: 10000 },
      );
      await testInfo.attach("native-failure", {
        path: image,
        contentType: "image/png",
      });
      const recovery = panel.locator(".capture-reopen button");
      if (await recovery.isVisible()) {
        // A frame failure still awaits the UI's recovery gesture. Complete it
        // during failed-test cleanup so the actual error reaches the evidence.
        await nativeClick(".capture-reopen button");
        await expect(recovery).not.toBeVisible();
        await attachJson(
          testInfo,
          "failure-recovered-state",
          await panel.evaluate(() => {
            const doc =
              window.documentPictureInPicture.window?.document || document;
            return { status: doc.querySelector(".status")?.textContent };
          }),
        );
      }
    }
    await context?.close();
  } finally {
    // Wait for the owned desktop to exit before the next test starts, including
    // the session bus and manager children in their dedicated process group.
    try {
      await stopProcess(manager, true);
    } finally {
      if (narrationApp) {
        await stopProcess(narrationApp);
        narrationApp = undefined;
      }
      await stopProcess(desktop);
      await testInfo.attach("desktop-startup", {
        body: `${browserName}\n${desktopLog}\n${managerLog}`,
        contentType: "text/plain",
      });
      if (directory) await rm(directory, { recursive: true, force: true });
      if (autoBridge) {
        await autoBridge.close();
        autoBridge = undefined;
      }
      if (authorizationServer) {
        await new Promise<void>((done, reject) => {
          authorizationServer!.close((error) =>
            error ? reject(error) : done(),
          );
        });
        authorizationServer = undefined;
      }
    }
  }
});

for (const kind of ["region", "element"] as const) {
  test(`web authorization: ${kind} explains screenshot activation before drawing`, async () => {
    await waitForInactiveCaptureGesture();
    const result = await evaluateWithoutGesture<string>(
      `Promise.race([
        window.captureWeb(${JSON.stringify(kind)}).then(
          () => "unexpected capture", error => error.message
        ),
        new Promise(resolve => setTimeout(() => resolve("selection opened before authorization"), 1500))
      ])`,
    );

    expect(result).toBe("capture_permission");
    await expect(site.locator("[data-blinkling-crop]")).toHaveCount(0);
    await expect(site.locator("[data-blinkling-overlay] .shade")).toHaveCount(
      0,
    );
  });
}

for (const permission of ["onboarding", "capture gesture"] as const) {
  test(`web authorization: ${permission} grants once and captures a new tab without toolbar activation`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(() => chrome.storage.local.set({ consented: false }));
    await panel.goto(
      `chrome-extension://${new URL(worker.url()).host}/panel.html`,
    );
    await nativeClick(".consent button.wide");
    await answerPermission(
      permission === "onboarding" ? "Allow" : "Deny",
      testInfo,
    );
    await expect
      .poll(() =>
        panel.evaluate(() =>
          chrome.permissions.contains({ origins: ["<all_urls>"] }),
        ),
      )
      .toBe(permission === "onboarding");
    await nativeClick(".consent button.primary:last-of-type");
    await expect
      .poll(() =>
        panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
      )
      .toBe(true);
    await site.bringToFront();
    await nativeClick(`button[aria-label="${en.moreTools}"]`, true);
    const captureButton = await panel.evaluate((label) => {
      const buttons = [
        ...window.documentPictureInPicture.window!.document.querySelectorAll(
          ".tools-menu button",
        ),
      ];
      const index = buttons.findIndex(
        (button) => button.textContent?.trim() === label,
      );
      if (index < 0) throw new Error(`Capture button not found: ${label}`);
      return `.tools-menu button:nth-child(${index + 1})`;
    }, en.visible);
    await nativeClick(captureButton, true);
    if (permission === "capture gesture")
      await answerPermission("Allow", testInfo);
    const preview = () =>
      panel.evaluate(
        () =>
          window.documentPictureInPicture.window?.document.querySelector<HTMLImageElement>(
            ".capture-chip img",
          )?.src,
      );
    await expect.poll(preview).toMatch(/^data:image\/png/);
    expect(
      await panel.evaluate(() =>
        chrome.permissions.contains({ origins: ["<all_urls>"] }),
      ),
    ).toBe(true);
    expect(
      await panel.evaluate(
        () => window.documentPictureInPicture.window!.document.body.textContent,
      ),
    ).not.toMatch(/Extensions menu|Reopen bubble/);
    const sourceUrl = site.url();
    site = await context.newPage();
    const freshUrl = new URL("/fresh-tab", sourceUrl);
    freshUrl.hostname = "new.blinkling.test";
    await site.goto(freshUrl.href);
    await site.bringToFront();
    await nativeClick(
      '.capture-buttons button[title="Crop the shared screen (Ctrl+Shift+S, or Cmd+Shift+S on Mac)"]',
      true,
    );
    await expect(site.locator("[data-blinkling-crop] .surface")).toBeVisible();
    // Real keyboard selection checks the permission on a new tab, without
    // another request or invoking the browser action to refresh activeTab.
    nativeInput("keys", "Right", "Down", "Return");
    await expect(site.locator("[data-blinkling-crop]")).toHaveCount(0);
    await restoreFloatingSurface();
    await expect
      .poll(() =>
        panel.evaluate(
          () =>
            window.documentPictureInPicture.window!.document.querySelector(
              ".capture-chip",
            )?.textContent,
        ),
      )
      .toContain(en.region);
    await attachJson(
      testInfo,
      "authorized-capture-windows",
      await panel.evaluate(() => chrome.windows.getAll({ populate: true })),
    );
  });
}

test("web authorization: a guide arriving on a background page preserves foreground window and bubble geometry", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  const worker = context.serviceWorkers()[0];
  await panel.goto(
    `chrome-extension://${new URL(worker.url()).host}/panel.html`,
  );
  await nativeClick(".float-start button");
  await expect
    .poll(() =>
      panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
    )
    .toBe(true);
  await site.bringToFront();
  await site.evaluate(() => {
    document.body.innerHTML += '<button id="guide-target">Export</button>';
  });
  await panel.evaluate(async (tabId) => {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }, authorizationTabId);
  const guideContext = await panel.evaluate(
    (tabId) =>
      chrome.tabs.sendMessage(tabId, { type: "blinkling:guide-context" }),
    authorizationTabId,
  );
  const foreground = await panel.evaluate(() =>
    chrome.windows.create({
      url: "data:text/html,<title>Foreground app</title><input autofocus>",
      type: "normal",
      width: 700,
      height: 500,
    }),
  );
  const before = await panel.evaluate(() => chrome.windows.getAll());
  await panel.evaluate(
    async ({ tabId, elementId }) => {
      await chrome.tabs.sendMessage(tabId, {
        type: "blinkling:guide",
        steps: [{ elementId, note: "Export your document" }],
      });
    },
    {
      tabId: authorizationTabId,
      elementId: guideContext.elements.find(
        (element: { text: string }) => element.text === "Export",
      ).id,
    },
  );
  await expect(site.locator("[data-blinkling-overlay] .guide")).toBeAttached();
  await site.evaluate(() => {
    dispatchEvent(new Event("scroll"));
    dispatchEvent(new Event("resize"));
  });
  await panel.waitForTimeout(250);
  const after = await panel.evaluate(() => chrome.windows.getAll());
  expect(after.find((native) => native.focused)?.id).toBe(foreground.id);
  expect(
    after.map(({ id, left, top, width, height, state }) => ({
      id,
      left,
      top,
      width,
      height,
      state,
    })),
  ).toEqual(
    before.map(({ id, left, top, width, height, state }) => ({
      id,
      left,
      top,
      width,
      height,
      state,
    })),
  );
  await attachJson(testInfo, "guide-window-focus", { before, after });
});

async function retainDeniedSelection() {
  await waitForInactiveCaptureGesture();
  const denial = await evaluateWithoutGesture<{
    message: string;
    pending?: PendingWebCapture;
  }>(`(async () => {
    try {
      await window.captureWeb("region", [60, 100, 180, 120]);
      return { message: "unexpected capture" };
    } catch (error) {
      window.pending = error.pending;
      return { message: error.message, pending: error.pending };
    }
  })()`);
  expect(denial.message).toBe("capture_permission");
  expect(denial.pending).toMatchObject({
    kind: "region",
    tabId: authorizationTabId,
    url: site.url(),
    documentId: expect.any(String),
    rect: [60, 100, 180, 120],
  });
}

async function activateScreenshotSource() {
  await site.bringToFront();
  const cdp = await context.browser()!.newBrowserCDPSession();
  try {
    const { targetInfos } = await cdp.send("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }],
    });
    const target = targetInfos.find((entry) => entry.url === site.url());
    if (!target) throw new Error("Missing screenshot source browser tab");
    await cdp.send("Extensions.triggerAction", {
      id: new URL(panel.url()).host,
      targetId: target.targetId,
    });
  } finally {
    await cdp.detach();
  }
  await site.bringToFront();
}

test("web authorization: a retained crop resumes after real browser activation with fresh pixels in the same rectangle", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await retainDeniedSelection();
  // The denied screenshot must never become a cached crop. Preserve geometry,
  // but read the page's current pixels once Chrome grants capture activation.
  await site.locator("#patch").evaluate((patch) => {
    (patch as HTMLElement).style.background = "#26c781";
  });
  await activateScreenshotSource();

  const crop = await panel.evaluate(async () => {
    const fixture = window as NativeFixture;
    const result = await fixture.retryPendingWebCapture(fixture.pending!);
    const image = new Image();
    image.src = result.capture.image;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      image: result.capture.image,
      width: image.width,
      height: image.height,
      background: [...ctx.getImageData(0, 0, 1, 1).data],
      patch: [...ctx.getImageData(30, 20, 1, 1).data],
      edge: [...ctx.getImageData(170, 100, 1, 1).data],
    };
  });

  expect(crop).toMatchObject({
    width: 180,
    height: 120,
    background: [18, 90, 156, 255],
    patch: [38, 199, 129, 255],
    edge: [18, 90, 156, 255],
  });
  await expect(site.locator("[data-blinkling-crop]")).toHaveCount(0);
  expect(
    await panel.evaluate(() =>
      chrome.permissions.contains({ origins: ["<all_urls>"] }),
    ),
  ).toBe(false);
  const path = testInfo.outputPath("authorized-same-region.png");
  await writeFile(path, Buffer.from(crop.image.split(",")[1], "base64"));
  await testInfo.attach("authorized-same-region", {
    path,
    contentType: "image/png",
  });
});

for (const change of ["navigation", "same-URL reload"] as const) {
  test(`web authorization: ${change} invalidates a retained crop`, async () => {
    await retainDeniedSelection();
    if (change === "navigation")
      await site.goto(new URL("/another", site.url()).href);
    else await site.reload();
    await activateScreenshotSource();

    const result = await panel.evaluate(async () => {
      const fixture = window as NativeFixture;
      return fixture.retryPendingWebCapture(fixture.pending!).then(
        () => "unexpected stale crop",
        (error: Error) => error.message,
      );
    });

    expect(result).toBe("tab_changed");
    await expect(site.locator("[data-blinkling-crop]")).toHaveCount(0);
  });
}

async function recordFullscreen(testInfo: TestInfo) {
  const cdp = await context.newCDPSession(panel);
  const bounds = await cdp.send("Browser.getWindowForTarget");
  await cdp.detach();
  const metrics = await panel.evaluate(() => ({
    inner: [innerWidth, innerHeight],
    screen: [screen.width, screen.height],
    ratio: devicePixelRatio,
    image: (() => {
      const r = document
        .querySelector("[data-blinkling-frozen-crop] img")!
        .getBoundingClientRect();
      return [r.width, r.height];
    })(),
    fullscreen: Boolean(document.fullscreenElement),
  }));
  await attachJson(testInfo, "native-bounds", { ...bounds, metrics });
  const screenshot = testInfo.outputPath("desktop-crop.png");
  execFileSync(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-video_size",
      "1440x1000",
      "-i",
      display,
      "-frames:v",
      "1",
      screenshot,
    ],
    { timeout: 10000 },
  );
  await testInfo.attach("native-desktop", {
    path: screenshot,
    contentType: "image/png",
  });
  expect(bounds.bounds.windowState).toBe("fullscreen");
  expect([
    bounds.bounds.width! * metrics.ratio,
    bounds.bounds.height! * metrics.ratio,
  ]).toEqual([1440, 1000]);
  expect(metrics.inner).toEqual(metrics.screen);
  expect(metrics.image).toEqual([1440 / metrics.ratio, 1000 / metrics.ratio]);
}

for (const dpi of ["standard DPI", "HiDPI"]) {
  for (const request of ["resolved", "rejected"]) {
    test(`ordinary ${dpi}: ${request} DOM fullscreen still presents a foreground native crop`, async ({
      browserName,
    }, testInfo) => {
      expect(browserName).toBe("chromium");
      const previousState = await panel.evaluate(async () => {
        const tab = await chrome.tabs.getCurrent();
        return (await chrome.windows.get(tab!.windowId)).state;
      });
      expect(
        await panel.evaluate(
          async () => (await chrome.tabs.getCurrent())!.active,
        ),
      ).toBe(false);
      await panel.evaluate((request) => {
        document.documentElement.requestFullscreen =
          request === "resolved"
            ? async () => {}
            : async () => {
                throw new DOMException("No activation", "NotAllowedError");
              };
      }, request);
      await nativeClick("#crop", true);
      const frozen = panel.locator("[data-blinkling-frozen-crop]");
      await expect(frozen.locator(".surface")).toBeVisible();
      await expect
        .poll(() =>
          panel.evaluate(async () => (await chrome.tabs.getCurrent())?.active),
        )
        .toBe(true);
      await recordFullscreen(testInfo);
      nativeInput("pointer", "1340", "900", "down");
      nativeInput("pointer", "1440", "1000", "move");
      nativeInput("pointer", "1440", "1000", "up");
      await expect(frozen.locator("[data-handle]")).toHaveCount(8);
      nativeInput("keys", "Return");
      await expect(frozen).toHaveCount(0);
      await expect
        .poll(() =>
          panel.evaluate(() => typeof (window as NativeFixture).result),
        )
        .toBe("string");
      const result = await panel.evaluate(async () => {
        const src = (window as unknown as { result: string }).result;
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return {
          size: [img.width, img.height],
          pixel: [...ctx.getImageData(20, 20, 1, 1).data],
          marker: [...ctx.getImageData(55, 70, 1, 1).data],
        };
      });
      // The X11 pointer is clamped at the last display pixel, so the reverse
      // edge lands at physical 1439/999 (the exact crop remains unscaled).
      await attachJson(testInfo, "crop-pixels", result);
      expect(result.size).toEqual([99, 99]);
      expect(result.pixel).toEqual([17, 90, 154, 255]);
      expect(result.marker).toEqual([255, 255, 255, 255]);
      await expect
        .poll(() => site.evaluate(() => document.visibilityState))
        .toBe("visible");
      expect(
        await panel.evaluate(
          async () => (await chrome.windows.getCurrent()).state,
        ),
      ).toBe(previousState);
      expect(
        await panel.evaluate(
          async (id) => (await chrome.tabs.get(id)).active,
          previousTabId,
        ),
      ).toBe(true);
    });
  }
}

for (const mode of ["ordinary", "dedicated", "ordinary HiDPI"]) {
  test(`${mode} monitor frame exposes the recognizable desktop target under PiP`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    const pip = await panel.evaluate(
      async () => (await chrome.windows.getAll()).find((w) => w.alwaysOnTop)!,
    );
    const ratio = await panel.evaluate(() => devicePixelRatio);
    const x = (pip.left! + 30) * ratio,
      y = (pip.top! + 120) * ratio;
    await panel.evaluate(() => {
      (window as unknown as { useClearBubble: boolean }).useClearBubble = true;
    });
    await nativeClick("#frame", true);
    await reopenBubble();
    await expect
      .poll(() =>
        panel.evaluate(() => {
          const fixture = window as unknown as {
            result?: string;
            failure?: string;
          };
          return fixture.result?.startsWith("data:image/png")
            ? "captured"
            : fixture.failure;
        }),
      )
      .toBe("captured");
    const actual = await panel.evaluate(
      async ({ x, y, ratio }) => {
        const img = new Image();
        img.src = (window as unknown as { result: string }).result;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return {
          pixel: [...ctx.getImageData(x, y, 1, 1).data],
          marker: [...ctx.getImageData(100 * ratio, 170 * ratio, 1, 1).data],
          frame: canvas.toDataURL(),
        };
      },
      { x, y, ratio },
    );
    const path = testInfo.outputPath("frozen-monitor.png");
    await writeFile(path, Buffer.from(actual.frame.split(",")[1], "base64"));
    await testInfo.attach("frozen-monitor", { path, contentType: "image/png" });
    await attachJson(testInfo, "frame-pixels", {
      pixel: actual.pixel,
      marker: actual.marker,
      coordinates: { x, y, marker: [100 * ratio, 170 * ratio] },
    });
    expect(actual.pixel).toEqual([17, 90, 154, 255]);
    expect(actual.marker).toEqual([255, 255, 255, 255]);
  });
}

async function reopenBubble(live = true) {
  await expect(panel.locator("#reopen")).toBeVisible();
  expect(
    await panel.evaluate(() => window.documentPictureInPicture.window),
  ).toBeNull();
  await nativeClick("#reopen");
  await expect
    .poll(() => panel.evaluate(() => (window as NativeFixture).restoreCount))
    .toBe(1);
  const state = await panel.evaluate(() => {
    const doc = window.documentPictureInPicture.window!.document;
    const video = document.querySelector("video")!;
    return {
      draft: doc.querySelector<HTMLTextAreaElement>("#draft")!.value,
      visible: !doc.querySelector<HTMLElement>("div")!.hidden,
      track: (video.srcObject as MediaStream).getVideoTracks()[0].readyState,
      playing: !video.paused,
    };
  });
  expect(state).toEqual({
    draft: "Keep this conversation",
    visible: true,
    track: live ? "live" : "ended",
    playing: true,
  });
  await nativeClick("#draft", true);
  // XSync flushes the desktop event; Chrome's renderer still needs to process it.
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          window.documentPictureInPicture.window!.document.activeElement?.id,
      ),
    )
    .toBe("draft");
}

for (const mode of [
  "ordinary",
  "dedicated",
  "ordinary before decoder metadata",
]) {
  test(`${mode} cleared monitor crop preserves the target pixels beneath PiP`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    await panel.evaluate((reset) => {
      (window as NativeFixture).useClearBubble = true;
      (window as NativeFixture).resetDecoderForCrop = reset;
    }, mode === "ordinary before decoder metadata");
    await nativeClick("#crop", true);
    if (mode === "ordinary before decoder metadata") {
      expect(
        await panel.evaluate(() => (window as NativeFixture).decoderReset),
      ).toEqual({
        dimensions: [0, 0],
        track: "live",
      });
    }
    const frozen = panel.locator("[data-blinkling-frozen-crop]");
    await expect(frozen.locator(".surface")).toBeVisible();
    await recordFullscreen(testInfo);
    nativeInput("pointer", "60", "140", "down");
    nativeInput("pointer", "140", "200", "move");
    nativeInput("pointer", "140", "200", "up");
    await expect(frozen.locator("[data-handle]")).toHaveCount(8);
    nativeInput("keys", "Return");
    await expect(frozen).toHaveCount(0);
    await reopenBubble();
    await expect
      .poll(() => panel.evaluate(() => typeof (window as NativeFixture).result))
      .toBe("string");
    const result = await panel.evaluate(async () => {
      const image = new Image();
      image.src = (window as NativeFixture).result!;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return {
        size: [image.width, image.height],
        pixel: [...ctx.getImageData(40, 30, 1, 1).data],
        png: canvas.toDataURL(),
      };
    });
    await attachJson(testInfo, "crop-pixels", {
      size: result.size,
      pixel: result.pixel,
    });
    expect(result.size).toEqual([80, 60]);
    expect(result.pixel).toEqual([255, 255, 255, 255]);
    const path = testInfo.outputPath("frozen-crop.png");
    await writeFile(path, Buffer.from(result.png.split(",")[1], "base64"));
    await testInfo.attach("frozen-crop", { path, contentType: "image/png" });
  });
}

for (const ending of ["Escape", "share ending", "fullscreen failure"]) {
  test(`ordinary monitor crop restores the bubble and draft after ${ending}`, async () => {
    const prior = await panel.evaluate(
      async () => (await chrome.windows.getCurrent()).state,
    );
    await panel.evaluate((ending) => {
      (window as NativeFixture).useClearBubble = true;
      if (ending === "fullscreen failure") {
        const update = chrome.windows.update.bind(chrome.windows);
        chrome.windows.update = ((
          id: number,
          change: chrome.windows.UpdateInfo,
        ) =>
          change.state === "fullscreen"
            ? Promise.reject(new Error("Native refusal"))
            : update(id, change)) as typeof chrome.windows.update;
      }
    }, ending);
    await nativeClick("#crop", true);
    const frozen = panel.locator("[data-blinkling-frozen-crop]");
    if (ending !== "fullscreen failure") {
      await expect(frozen.locator(".surface")).toBeVisible();
      if (ending === "Escape") nativeInput("keys", "Escape");
      else await panel.evaluate(() => (window as NativeFixture).stopShare());
    }
    await expect(frozen).toHaveCount(0);
    await reopenBubble(ending !== "share ending");
    if (ending === "Escape")
      await expect
        .poll(() => panel.evaluate(() => (window as NativeFixture).result))
        .toBeNull();
    else
      await expect
        .poll(() => panel.evaluate(() => (window as NativeFixture).failure))
        .toBe(
          ending === "share ending" ? "share_ended" : "crop_fullscreen_denied",
        );
    expect(
      await panel.evaluate(
        async () => (await chrome.windows.getCurrent()).state,
      ),
    ).toBe(prior);
  });
}

test("ordinary crop preserves an originally fullscreen opener", async () => {
  await panel.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    await chrome.windows.update(tab!.windowId, { state: "fullscreen" });
  });
  await site.bringToFront();
  await nativeClick("#crop", true);
  const frozen = panel.locator("[data-blinkling-frozen-crop]");
  await expect(frozen.locator(".surface")).toBeVisible();
  nativeInput("keys", "Escape");
  await expect(frozen).toHaveCount(0);
  await expect
    .poll(() => panel.evaluate(() => (window as NativeFixture).result))
    .toBeNull();
  expect(
    await panel.evaluate(async () => (await chrome.windows.getCurrent()).state),
  ).toBe("fullscreen");
  expect(
    await panel.evaluate(
      async (id) => (await chrome.tabs.get(id)).active,
      previousTabId,
    ),
  ).toBe(true);
});

for (const trigger of ["Shift in PiP", "global shortcut"]) {
  test(`ordinary background opener is activated by ${trigger}`, async () => {
    await panel.evaluate(() => {
      document.documentElement.requestFullscreen = async () => {
        throw new DOMException("No activation", "NotAllowedError");
      };
    });
    if (trigger === "Shift in PiP") {
      await nativeClick("#resize", true);
      nativeInput("key-down", "Shift_L");
    } else nativeInput("chord", "Control_L", "Shift_L", "7");
    const frozen = panel.locator("[data-blinkling-frozen-crop]");
    await expect(frozen.locator(".surface")).toBeVisible();
    if (trigger === "Shift in PiP") nativeInput("key-up", "Shift_L");
    expect(
      await panel.evaluate(
        async () => (await chrome.tabs.getCurrent())!.active,
      ),
    ).toBe(true);
    nativeInput("keys", "Escape");
    await expect(frozen).toHaveCount(0);
    await expect
      .poll(() => panel.evaluate(() => (window as NativeFixture).result))
      .toBeNull();
    expect(
      await panel.evaluate(
        async (id) => (await chrome.tabs.get(id)).active,
        previousTabId,
      ),
    ).toBe(true);
  });
}

async function restoreFloatingSurface() {
  // Runtime.evaluate without userGesture avoids giving an Escape cancellation
  // the activation it would never have outside the test harness.
  await expect
    .poll(() =>
      evaluateWithoutGesture<string>(`(() => {
      const pip = window.documentPictureInPicture.window;
      if (pip?.document.querySelector('.composer textarea')) return 'pip';
      const popup = chrome.extension.getViews().find(view => view.location.search.includes('surfaceOnly=1'));
      return popup?.document.querySelector('.composer textarea') ? 'popup' : '';
    })()`),
    )
    .toMatch(/^(pip|popup)$/);
  const fallback = await evaluateWithoutGesture<boolean>(
    `!window.documentPictureInPicture.window`,
  );
  if (fallback) await nativeClick(".float-start button", true);
  await expect
    .poll(() =>
      evaluateWithoutGesture<boolean>(
        `(() => {
          const doc = window.documentPictureInPicture.window?.document;
          const button = doc?.querySelector('.capture-buttons button');
          return Boolean(doc?.querySelector('.composer textarea') && doc.body.dataset.bubbleState !== 'crop' && button && !button.disabled);
        })()`,
      ),
    )
    .toBe(true);
  return fallback;
}

async function desktopScreenshot(
  testInfo: TestInfo,
  name: string,
  attach = true,
) {
  const path = testInfo.outputPath(`${name}.png`);
  execFileSync(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-video_size",
      "1440x1000",
      "-i",
      display,
      "-frames:v",
      "1",
      "-y",
      path,
    ],
    { timeout: 10000 },
  );
  if (attach) await testInfo.attach(name, { path, contentType: "image/png" });
  return path;
}

async function paintedPickerControls(
  testInfo: TestInfo,
  name: string,
  opener: chrome.windows.Window,
  selected = false,
) {
  let path = "";
  let controls: ReturnType<typeof nativeControls> = [];
  // The chooser must be hosted by the separate opener. Restrict discovery to
  // that window so a chooser attached to an enlarged PiP cannot pass this test.
  const bounds: [number, number, number, number] = [
    opener.left!,
    opener.top!,
    opener.left! + opener.width!,
    opener.top! + opener.height!,
  ];
  await expect
    .poll(
      async () => {
        path = await desktopScreenshot(testInfo, name, false);
        controls = nativeControls(path, "picker", bounds);
        return controls.map((control) => control.name).sort();
      },
      { timeout: 15000 },
    )
    .toEqual(selected ? ["Cancel", "Share"] : ["Cancel"]);
  await testInfo.attach(name, { path, contentType: "image/png" });
  await attachJson(testInfo, `${name}-controls`, { bounds, controls });
  return { path, controls };
}

function desktopPixel(path: string, x: number, y: number) {
  const pixels = execFileSync(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      "-i",
      path,
      "-vf",
      `crop=1:1:${x}:${y}`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { timeout: 10000 },
  );
  return [...pixels];
}

async function assertUnobstructedFrozenPixels(path: string) {
  const points = [
    [800, 195],
    [800, 500],
  ];
  const captured = await evaluateWithoutGesture<number[][]>(`(() => {
    const image = document.querySelector('[data-blinkling-frozen-crop] img');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const bounds = image.getBoundingClientRect();
    return ${JSON.stringify(points)}.map(([x,y]) => Array.from(context.getImageData(
      Math.floor((x-bounds.left)*canvas.width/bounds.width),
      Math.floor((y-bounds.top)*canvas.height/bounds.height), 1, 1
    ).data).slice(0,3));
  })()`);
  for (const [index, [x, y]] of points.entries()) {
    // Monitor/tab video encoding can quantize the fixture's source blue.
    [18, 90, 156].forEach((channel, component) =>
      expect(
        Math.abs(captured[index][component] - channel),
      ).toBeLessThanOrEqual(12),
    );
    const native = desktopPixel(path, x, y);
    captured[index].forEach((channel, component) =>
      expect(
        Math.abs(native[component] - Math.round((channel * 2) / 3)),
      ).toBeLessThanOrEqual(2),
    );
  }
}

async function prepareProductionBubble() {
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ backend: "api" });
    await chrome.storage.session.set({ apiKey: "fixture-key" });
  });
  await context.route(
    "https://api.anthropic.com/v1/messages",
    async (route) => {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "POST, OPTIONS",
      };
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
        return;
      }
      await route.fulfill({
        headers,
        contentType: "text/event-stream",
        body:
          `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Native answer" } })}\n\n` +
          `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
      });
    },
  );
  await panel.goto(
    `chrome-extension://${new URL(worker.url()).host}/panel.html`,
  );
  await panel.locator(".composer textarea").fill("First conversation");
  await panel.locator(".composer button.send").click();
  await panel
    .getByRole("button", { name: "Ask without page content", exact: true })
    .click();
  await expect(panel.locator(".message .answer .markdown")).toHaveText(
    "Native answer",
  );
  await nativeClick(".float-start button");
  await expect
    .poll(() =>
      panel.evaluate(() => {
        const view = window.documentPictureInPicture.window;
        return (
          view?.document.querySelector(".composer textarea") && [
            view.innerWidth,
            view.innerHeight,
          ]
        );
      }),
    )
    .toEqual([420, 650]);
  await panel.evaluate(() => {
    const view = window.documentPictureInPicture.window!;
    const field = view.document.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, "Keep this draft");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  authorizationServer = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><title>Native work page</title><style>html,body{margin:0;min-height:100vh;background:#125a9c;color:white}</style><h1>Native work page</h1><p>This page must remain visible under the crop.</p>`,
    );
  });
  authorizationServer.listen(0, "127.0.0.1");
  await once(authorizationServer, "listening");
  const address = authorizationServer.address();
  if (!address || typeof address === "string")
    throw new Error("Missing native page port");
  const opened = context.waitForEvent("page");
  const source = await panel.evaluate(
    (url) => chrome.windows.create({ url, type: "normal", focused: true }),
    `http://127.0.0.1:${address.port}/`,
  );
  site = await opened;
  await site.waitForLoadState();
  await site.bringToFront();
  await expect
    .poll(() =>
      panel.evaluate(
        async (id) => (await chrome.windows.getLastFocused()).id === id,
        source!.id!,
      ),
    )
    .toBe(true);
  // Allow the real extension's source-tab listeners to settle in this window.
  await panel.waitForTimeout(600);
  return source!.id!;
}

for (const delayedFocus of [false, true]) {
  test(`v2.1 real picker ${delayedFocus ? "with delayed native PiP activation " : ""}is visible from a separate opener and restores the bubble on cancel and share`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    const sourceId = await prepareProductionBubble();
    const opener = await panel.evaluate(async () =>
      chrome.windows.get((await chrome.tabs.getCurrent())!.windowId!),
    );
    const initial = await panel.evaluate(
      async () => (await chrome.windows.getAll()).find((w) => w.alwaysOnTop)!,
    );
    for (const outcome of ["cancel", "share"] as const) {
      const position =
        outcome === "cancel"
          ? { left: 680, top: 180 }
          : {
              left: 1440 - initial.width! - 12,
              top: 1000 - initial.height! - 12,
            };
      await panel.evaluate(
        async ({ id, position }) => chrome.windows.update(id!, position),
        { id: initial.id, position },
      );
      await site.bringToFront();
      if (delayedFocus) {
        await panel.evaluate(
          ({ openerId, bubbleId }) => {
            const fixture = window as Window & {
              pickerNativeUpdate?: typeof chrome.windows.update;
            };
            const update = (fixture.pickerNativeUpdate ||=
              chrome.windows.update.bind(chrome.windows));
            let activated = false;
            chrome.windows.update = ((
              id: number,
              change: chrome.windows.UpdateInfo,
            ) => {
              const result = update(id, change);
              if (id === openerId && change.focused && !activated) {
                activated = true;
                // Reproduce the late native activation seen in CI after moving
                // PiP. This uses the actual Chrome windows, not synthetic DOM focus.
                void result.then(() =>
                  setTimeout(() => {
                    void update(bubbleId!, { focused: true });
                  }, 100),
                );
              }
              return result;
            }) as typeof chrome.windows.update;
          },
          { openerId: opener.id, bubbleId: initial.id },
        );
      }
      await nativeClick(".capture-buttons button", true);
      await expect
        .poll(() =>
          panel.evaluate(
            async () =>
              (await chrome.windows.getAll()).find((w) => w.alwaysOnTop)!.left,
          ),
        )
        .toBe(1440 - Math.round(initial.width! / 2));
      expect(
        await panel.evaluate(
          () =>
            window.documentPictureInPicture.window!.document.querySelector(
              ".status",
            )!.textContent,
        ),
      ).toContain(en.screenPickerPending);
      await paintedPickerControls(testInfo, `real-picker-${outcome}`, opener);
      if (outcome === "cancel") nativeInput("keys", "Escape");
      else {
        // Cancel initially has native keyboard focus. Move back to the screen
        // tile and select it without assuming the thumbnail's screen coordinates.
        nativeInput("chord", "Shift_L", "Tab");
        nativeInput("keys", "space");
        const selected = await paintedPickerControls(
          testInfo,
          "real-picker-selected",
          opener,
          true,
        );
        const share = selected.controls.find(
          (control) => control.name === "Share",
        )!;
        const sharePoint = {
          x: Math.round(share.x + share.width / 2),
          y: Math.round(share.y + share.height / 2),
        };
        expect(
          desktopPixel(selected.path, sharePoint.x + 20, sharePoint.y),
        ).toEqual([11, 87, 208]);
        nativeInput("click", String(sharePoint.x), String(sharePoint.y));
      }
      await expect
        .poll(() =>
          evaluateWithoutGesture<number>(
            `chrome.windows.getLastFocused().then(w => w.id)`,
          ),
        )
        .toBe(sourceId);
      if (outcome === "share")
        await expect
          .poll(() =>
            evaluateWithoutGesture(`(() => {
        const view = window.documentPictureInPicture.window || chrome.extension.getViews().find(view => view.location.search.includes('surfaceOnly=1'));
        return Boolean(view?.document.querySelector('.capture-chip'));
      })()`),
          )
          .toBe(true);
      await restoreFloatingSurface();
      await expect
        .poll(() =>
          panel.evaluate(async () => {
            const bubble = (await chrome.windows.getAll()).find(
              (w) => w.alwaysOnTop,
            )!;
            return {
              left: bubble.left,
              top: bubble.top,
              width: bubble.width,
              height: bubble.height,
            };
          }),
        )
        .toEqual({ ...position, width: initial.width, height: initial.height });
      const state = await panel.evaluate(() => {
        const doc = window.documentPictureInPicture.window!.document;
        const stream = document.querySelector("video")!
          .srcObject as MediaStream | null;
        return {
          draft: doc.querySelector<HTMLTextAreaElement>("textarea")!.value,
          history: doc
            .querySelector(".message .answer .markdown")!
            .textContent?.trim(),
          attached: Boolean(doc.querySelector(".capture-chip")),
          track: stream?.getVideoTracks()[0].readyState || null,
        };
      });
      expect(state).toEqual({
        draft: "Keep this draft",
        history: "Native answer",
        attached: outcome === "share",
        track: outcome === "share" ? "live" : null,
      });
    }
    // A later user move is the geometry for subsequent captures, not the first
    // picker's position. The accepted attachment and exact live track survive.
    await panel.evaluate(async () => {
      const bubble = (await chrome.windows.getAll()).find(
        (w) => w.alwaysOnTop,
      )!;
      await chrome.windows.update(bubble.id!, { left: 450, top: 170 });
      (window as Window & { savedTrack: MediaStreamTrack }).savedTrack = (
        document.querySelector("video")!.srcObject as MediaStream
      ).getVideoTracks()[0];
    });
    await nativeClick(".capture-buttons button", true);
    await expect
      .poll(() =>
        evaluateWithoutGesture(`(() => {
    const view = window.documentPictureInPicture.window || chrome.extension.getViews().find(view => view.location.search.includes('surfaceOnly=1'));
    const button = view?.document.querySelector('.capture-buttons button');
    return Boolean(button && !button.disabled);
  })()`),
      )
      .toBe(true);
    await restoreFloatingSurface();
    await expect
      .poll(() =>
        panel.evaluate(async () => {
          const bubble = (await chrome.windows.getAll()).find(
            (w) => w.alwaysOnTop,
          )!;
          return [bubble.left, bubble.top];
        }),
      )
      .toEqual([450, 170]);
    expect(
      await panel.evaluate(
        () =>
          (
            document.querySelector("video")!.srcObject as MediaStream
          ).getVideoTracks()[0] ===
          (window as Window & { savedTrack: MediaStreamTrack }).savedTrack,
      ),
    ).toBe(true);
    await attachJson(
      testInfo,
      "real-picker-final-windows",
      await panel.evaluate(() => chrome.windows.getAll()),
    );
  });
}

for (const scheme of ["light", "dark"]) {
  test(`v2.1 ${scheme} native surface reduces Blink obstruction and clears all crop pixels and input`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    const sourceId = await prepareProductionBubble();
    await panel.evaluate(
      (id) => chrome.windows.update(id, { state: "fullscreen", focused: true }),
      sourceId,
    );
    await nativeClick('[role="switch"]', true);
    await expect
      .poll(() =>
        evaluateWithoutGesture<string>(
          `document.querySelector('video').srcObject?.getVideoTracks()[0].readyState || ''`,
        ),
      )
      .toBe("live");
    const original = await panel.evaluate(async () => {
      const bubble = (await chrome.windows.getAll()).find(
        (w) => w.alwaysOnTop,
      )!;
      await chrome.windows.update(bubble.id!, { left: 760, top: 180 });
      const saved = window as Window & { savedTrack: MediaStreamTrack };
      saved.savedTrack = (
        document.querySelector("video")!.srcObject as MediaStream
      ).getVideoTracks()[0];
      return { ...bubble, left: 760, top: 180 };
    });
    nativeInput("pointer", "200", "700", "move");
    const idle = await desktopScreenshot(testInfo, `${scheme}-idle`);
    // Record the native opacity limit rather than mistaking faded DOM paint for
    // desktop transparency. The unobstructed crop below must clear this pixel.
    expect(desktopPixel(idle, 800, 500)).not.toEqual([18, 90, 156]);
    // Include the measured native frame, including any testing-only banner,
    // without attributing it to the compact product's 240x72 content area.
    const compactSize = {
      width: 240 + original.width! - 420,
      height: 72 + original.height! - 650,
    };
    const compactLeft = 1440 - Math.round(compactSize.width / 2);
    await nativeClick(`button[aria-label="${en.compact}"]`, true);
    await expect
      .poll(() =>
        panel.evaluate(async () => {
          const bubble = (await chrome.windows.getAll()).find(
            (w) => w.alwaysOnTop,
          )!;
          return {
            left: bubble.left,
            width: bubble.width,
            height: bubble.height,
          };
        }),
      )
      .toEqual({ left: compactLeft, ...compactSize });
    const compact = await desktopScreenshot(testInfo, `${scheme}-blink`);
    expect(desktopPixel(compact, 1290, 950)).toEqual([18, 90, 156]);
    expect(
      await panel.evaluate(
        () =>
          window.documentPictureInPicture.window!.document.querySelector(
            ".blink-dot .blink",
          ) !== null,
      ),
    ).toBe(true);
    // Drag Blink from the bottom dock to the right edge using real input.
    const dot = await evaluateWithoutGesture<{ x: number; y: number }>(`(() => {
      const view = window.documentPictureInPicture.window;
      const rect = view.document.querySelector('.blink-dot').getBoundingClientRect();
      return { x: Math.round(view.screenX + (view.outerWidth - view.innerWidth) / 2 + rect.x + rect.width / 2), y: Math.round(view.screenY + view.outerHeight - view.innerHeight + rect.y + rect.height / 2) };
    })()`);
    nativeInput("pointer", String(dot.x), String(dot.y), "down");
    nativeInput("pointer", String(dot.x), "480", "move");
    nativeInput("pointer", String(dot.x), "480", "up");
    await expect
      .poll(() =>
        evaluateWithoutGesture(
          `chrome.storage.local.get('blinkDock').then(saved => saved.blinkDock)`,
        ),
      )
      .toEqual({ edge: "right", y: 0.48 });
    await expect
      .poll(() =>
        evaluateWithoutGesture(`chrome.windows.getAll().then(windows => {
      const bubble = windows.find(w => w.alwaysOnTop);
      return [bubble.left, bubble.top, bubble.width, bubble.height];
    })`),
      )
      .toEqual([
        compactLeft,
        Math.round(480 - compactSize.height / 2),
        compactSize.width,
        compactSize.height,
      ]);
    await desktopScreenshot(testInfo, `${scheme}-blink-docked`);
    await nativeClick(".blink-dot", true);
    await expect
      .poll(() =>
        panel.evaluate(async () => {
          const bubble = (await chrome.windows.getAll()).find(
            (w) => w.alwaysOnTop,
          )!;
          return [bubble.left, bubble.top, bubble.width, bubble.height];
        }),
      )
      .toEqual([original.left, original.top, original.width, original.height]);
    await nativeClick('.capture-buttons button[title^="Crop"]', true);
    const frozen = panel.locator("[data-blinkling-frozen-crop]");
    await expect(frozen.locator(".surface")).toBeVisible();
    await expect
      .poll(() =>
        evaluateWithoutGesture(
          `chrome.windows.getAll().then(windows => windows.filter(w => w.alwaysOnTop && w.state !== 'minimized').length)`,
        ),
      )
      .toBe(0);
    await expect(frozen.locator(".surface")).toBeVisible();
    await panel.waitForTimeout(200);
    const crop = await desktopScreenshot(testInfo, `${scheme}-crop-clear`);
    // Both the native title bar and content footprint show the frozen page.
    await assertUnobstructedFrozenPixels(crop);
    // Real pointer selection crosses where the PiP title bar and body stood.
    nativeInput("pointer", "800", "195", "down");
    nativeInput("pointer", "880", "520", "move");
    nativeInput("pointer", "880", "520", "up");
    await expect(frozen.locator("[data-handle]")).toHaveCount(8);
    await expect(frozen.locator("output")).toHaveText("80 × 325 px");
    await panel.waitForTimeout(5500);
    nativeInput("keys", "Escape");
    await expect(frozen).toHaveCount(0);
    const usedFallback = await restoreFloatingSurface();
    await attachJson(testInfo, `${scheme}-native-surface`, {
      original,
      usedFallback,
      windows: await panel.evaluate(() => chrome.windows.getAll()),
    });
    expect(
      await panel.evaluate(() => {
        const doc = window.documentPictureInPicture.window!.document;
        const saved = (window as Window & { savedTrack: MediaStreamTrack })
          .savedTrack;
        return {
          draft: doc.querySelector<HTMLTextAreaElement>("textarea")!.value,
          history: doc
            .querySelector(".message .answer .markdown")!
            .textContent?.trim(),
          sameTrack:
            saved ===
            (
              document.querySelector("video")!.srcObject as MediaStream
            ).getVideoTracks()[0],
          live: saved.readyState,
          cropping: doc.body.dataset.bubbleState === "crop",
          pointerEvents: doc.body.style.pointerEvents,
        };
      }),
    ).toEqual({
      draft: "Keep this draft",
      history: "Native answer",
      sameTrack: true,
      live: "live",
      cropping: false,
      pointerEvents: "",
    });
  });
}

for (const entry of ["button DOM", "button native", "Shift native"]) {
  test(`v2.1 browser share cancels on one Escape from ${entry} fullscreen`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    const sourceId = await prepareProductionBubble();
    await panel.evaluate(
      (id) => chrome.windows.update(id, { state: "fullscreen", focused: true }),
      sourceId,
    );
    await nativeClick('[role="switch"]', true);
    await expect
      .poll(() =>
        evaluateWithoutGesture(
          `document.querySelector('video').srcObject?.getVideoTracks()[0].getSettings().displaySurface`,
        ),
      )
      .toBe("browser");
    const before = await panel.evaluate(async (nativeFallback) => {
      const bubble = (await chrome.windows.getAll()).find(
        (w) => w.alwaysOnTop,
      )!;
      await chrome.windows.update(bubble.id!, { left: 760, top: 180 });
      (window as Window & { savedTrack: MediaStreamTrack }).savedTrack = (
        document.querySelector("video")!.srcObject as MediaStream
      ).getVideoTracks()[0];
      if (nativeFallback)
        document.documentElement.requestFullscreen = async () => {
          throw new DOMException("No activation", "NotAllowedError");
        };
      else {
        // Chrome can resolve DOM fullscreen without expanding a background
        // native window. Start with the opener already fullscreen to exercise
        // its actual DOM fullscreen path and restoration of that user state.
        await chrome.windows.update(
          (await chrome.tabs.getCurrent())!.windowId,
          {
            state: "fullscreen",
          },
        );
      }
      return {
        ...(await chrome.windows.get(
          (await chrome.tabs.getCurrent())!.windowId,
        )),
        bubble: { ...bubble, left: 760, top: 180 },
      };
    }, !entry.includes("DOM"));
    await site.bringToFront();
    await expect
      .poll(() =>
        evaluateWithoutGesture<number>(
          `chrome.windows.getLastFocused().then(w => w.focused ? w.id : null)`,
        ),
      )
      .toBe(sourceId);
    await panel.waitForTimeout(250);
    if (entry.includes("Shift")) {
      await nativeClick(".topbar .brand", true);
      nativeInput("key-down", "Shift_L");
    } else await nativeClick('.capture-buttons button[title^="Crop"]', true);
    const frozen = panel.locator("[data-blinkling-frozen-crop]");
    await expect(frozen.locator(".surface")).toBeVisible();
    if (entry.includes("Shift")) nativeInput("key-up", "Shift_L");
    const fullscreen = await evaluateWithoutGesture(
      `(async () => ({ dom: Boolean(document.fullscreenElement), native: await chrome.windows.get((await chrome.tabs.getCurrent()).windowId) }))()`,
    );
    await attachJson(testInfo, `${entry}-fullscreen`, fullscreen);
    expect(fullscreen).toMatchObject({
      dom: entry.includes("DOM"),
      native: { state: "fullscreen", width: 1440, height: 1000 },
    });
    await panel.waitForTimeout(200);
    const crop = await desktopScreenshot(
      testInfo,
      `${entry}-browser-crop-clear`,
    );
    await assertUnobstructedFrozenPixels(crop);
    nativeInput("pointer", "800", "195", "down");
    nativeInput("pointer", "880", "520", "move");
    nativeInput("pointer", "880", "520", "up");
    await expect(frozen.locator("output")).toHaveText("80 × 325 px");
    await panel.waitForTimeout(5500);
    nativeInput("keys", "Escape");
    await expect(frozen).toHaveCount(0);
    const usedFallback = await restoreFloatingSurface();
    await expect
      .poll(() =>
        evaluateWithoutGesture(`(async () => {
      const doc = window.documentPictureInPicture.window?.document;
      const current = await chrome.windows.get(${before.id});
      const foreground = await chrome.windows.getLastFocused();
      return {
        state: current.state, geometry: [current.left, current.top, current.width, current.height],
        foreground: foreground.id,
        draft: doc?.querySelector('textarea').value,
        sameTrack: window.savedTrack === document.querySelector('video').srcObject.getVideoTracks()[0],
        live: window.savedTrack.readyState,
        crop: doc?.body.dataset.bubbleState === 'crop',
        pointerEvents: doc?.body.style.pointerEvents,
      };
    })()`),
      )
      .toEqual({
        state: before.state,
        geometry: [before.left, before.top, before.width, before.height],
        foreground: sourceId,
        draft: "Keep this draft",
        sameTrack: true,
        live: "live",
        crop: false,
        pointerEvents: "",
      });
    await attachJson(testInfo, `${entry}-restored`, {
      before,
      usedFallback,
      windows: await panel.evaluate(() => chrome.windows.getAll()),
    });
  });
}

for (const mode of ["unpacked", "dedicated", "unpacked HiDPI"]) {
  for (const acceptedCrop of [false, true]) {
    test(
      acceptedCrop
        ? `production chat preserves an accepted crop through native cancellation and failure in ${mode} mode`
        : `production chat preserves sharing, draft and history through native capture in ${mode} mode`,
      async ({ browserName }, testInfo) => {
        expect(browserName).toBe("chromium");
        const worker = context.serviceWorkers()[0];
        await worker.evaluate(async () => {
          await chrome.storage.local.set({
            backend: "api",
            pipSize: { width: 420, height: 650 },
          });
          await chrome.storage.session.set({ apiKey: "fixture-key" });
        });
        const images: string[] = [];
        await context.route(
          "https://api.anthropic.com/v1/messages",
          async (route) => {
            const headers = {
              "access-control-allow-origin": "*",
              "access-control-allow-headers": "*",
              "access-control-allow-methods": "POST, OPTIONS",
            };
            if (route.request().method() === "OPTIONS") {
              await route.fulfill({ status: 204, headers });
              return;
            }
            const input = route.request().postDataJSON();
            for (const message of input.messages)
              for (const block of message.content)
                if (block.type === "image")
                  images.push(`data:image/png;base64,${block.source.data}`);
            await route.fulfill({
              headers,
              contentType: "text/event-stream",
              body: [
                {
                  type: "content_block_delta",
                  delta: { type: "text_delta", text: "Native answer" },
                },
                { type: "message_delta", delta: { stop_reason: "end_turn" } },
                { type: "message_stop" },
              ]
                .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                .join(""),
            });
          },
        );
        await panel.goto(
          `chrome-extension://${new URL(worker.url()).host}/panel.html`,
        );
        await panel.bringToFront();
        await panel.locator(".composer textarea").fill("First conversation");
        await panel.locator(".composer button.send").click();
        await panel
          .getByRole("button", {
            name: "Ask without page content",
            exact: true,
          })
          .click();
        await expect(panel.locator(".message .answer .markdown")).toHaveText(
          "Native answer",
        );
        await nativeClick(".float-start button");
        await expect
          .poll(() =>
            panel.evaluate(() =>
              Boolean(
                window.documentPictureInPicture.window?.document.querySelector(
                  ".composer textarea",
                ),
              ),
            ),
          )
          .toBe(true);
        await panel.evaluate(() => {
          (window as Window & { firstSharePiP?: Window }).firstSharePiP =
            window.documentPictureInPicture.window!;
          const field =
            window.documentPictureInPicture.window!.document.querySelector(
              "textarea",
            )!;
          Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          )!.set!.call(field, "Keep this draft and conversation");
          field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await site.bringToFront();
        await nativeClick('[role="switch"]', true);
        await expect
          .poll(() =>
            panel.evaluate(
              () =>
                window.documentPictureInPicture.window?.document.querySelector(
                  ".status",
                )?.textContent,
            ),
          )
          .toContain("Sharing");
        expect(
          await panel.evaluate(() => {
            const floating = window.documentPictureInPicture.window;
            return {
              samePiP:
                floating ===
                (window as Window & { firstSharePiP?: Window }).firstSharePiP,
              acceptedCapture: Boolean(
                floating?.document.querySelector(".capture-chip"),
              ),
              captureRecovery: Boolean(
                document.querySelector(".capture-reopen") ||
                  floating?.document.querySelector(".capture-reopen"),
              ),
            };
          }),
        ).toEqual({
          samePiP: true,
          acceptedCapture: false,
          captureRecovery: false,
        });
        await panel.evaluate(() => {
          const video = document.querySelector("video")!;
          (
            window as Window & {
              savedVideo?: HTMLVideoElement;
              savedTrack?: MediaStreamTrack;
            }
          ).savedVideo = video;
          (window as Window & { savedTrack?: MediaStreamTrack }).savedTrack = (
            video.srcObject as MediaStream
          ).getVideoTracks()[0];
        });
        const supportsMinimize = await panel.evaluate(async () => {
          const native = (await chrome.windows.getAll()).find(
            (w) => w.alwaysOnTop,
          )!;
          try {
            await chrome.windows.update(native.id!, { state: "minimized" });
            await chrome.windows.update(native.id!, { state: "normal" });
            return true;
          } catch (error) {
            if (
              !String(error).includes(
                "Operation not allowed for picture-in-picture windows",
              )
            )
              throw error;
            return false;
          }
        });
        await site.bringToFront();
        const ratio = await panel.evaluate(() => devicePixelRatio);
        const nativeGeometry = () =>
          panel.evaluate(
            async (supportsMinimize) =>
              (await chrome.windows.getAll()).map(
                ({ id, alwaysOnTop, left, top, width, height, state }) => ({
                  id: alwaysOnTop && !supportsMinimize ? "bubble" : id,
                  left,
                  top,
                  width,
                  height,
                  state,
                }),
              ),
            supportsMinimize,
          );
        const originalGeometry = await nativeGeometry();
        const bubbleWindowId = await panel.evaluate(
          async () =>
            (await chrome.windows.getAll()).find((native) => native.alwaysOnTop)
              ?.id,
        );
        const activeTabs = () =>
          panel.evaluate(async (supportsMinimize) => {
            const bubbleId = (await chrome.windows.getAll()).find(
              (w) => w.alwaysOnTop,
            )?.id;
            return (await chrome.tabs.query({ active: true }))
              .filter((tab) => supportsMinimize || tab.windowId !== bubbleId)
              .map(({ id, windowId }) => ({ id, windowId }));
          }, supportsMinimize);
        const originalActiveTabs = await activeTabs();
        if (mode.includes("HiDPI")) {
          expect(ratio).toBe(2);
          // A command or a macOS PiP gesture may lack DOM fullscreen activation.
          // Keep the native window manager real while exercising that fallback.
          await panel.evaluate(() => {
            document.documentElement.requestFullscreen = async () => {
              throw new DOMException("No activation", "NotAllowedError");
            };
          });
        }
        let hasCaptured = false;
        const checkState = async () => {
          await expect.poll(nativeGeometry).toEqual(originalGeometry);
          await expect.poll(activeTabs).toEqual(originalActiveTabs);
          expect(
            await panel.evaluate(() => {
              const saved = window as Window & {
                savedVideo: HTMLVideoElement;
                savedTrack: MediaStreamTrack;
              };
              const doc = window.documentPictureInPicture.window!.document;
              return {
                samePiP:
                  window.documentPictureInPicture.window ===
                  (window as Window & { firstSharePiP: Window }).firstSharePiP,
                sameVideo: saved.savedVideo === document.querySelector("video"),
                sameTrack:
                  (
                    document.querySelector("video")!.srcObject as MediaStream
                  ).getVideoTracks()[0] === saved.savedTrack,
                live: saved.savedTrack.readyState,
                draft: doc.querySelector("textarea")!.value,
                history: doc
                  .querySelector(".message .answer .markdown")!
                  .textContent?.trim(),
              };
            }),
          ).toEqual({
            samePiP: supportsMinimize || !hasCaptured,
            sameVideo: true,
            sameTrack: true,
            live: "live",
            draft: "Keep this draft and conversation",
            history: "Native answer",
          });
        };
        await checkState();
        hasCaptured = true;
        let acceptedImage: string | undefined;
        if (acceptedCrop) {
          await site.bringToFront();
          await nativeClick(
            '.capture-buttons button[title="Crop the shared screen (Ctrl+Shift+S, or Cmd+Shift+S on Mac)"]',
            true,
          );
          const frozen = panel.locator("[data-blinkling-frozen-crop]");
          await expect(frozen.locator(".surface")).toBeVisible();
          nativeInput(
            "pointer",
            String(60 * ratio),
            String(140 * ratio),
            "down",
          );
          nativeInput(
            "pointer",
            String(60 * ratio + 80),
            String(140 * ratio + 60),
            "move",
          );
          nativeInput(
            "pointer",
            String(60 * ratio + 80),
            String(140 * ratio + 60),
            "up",
          );
          await expect(frozen.locator("[data-handle]")).toHaveCount(8);
          nativeInput("keys", "Return");
          await expect(
            panel.locator("[data-blinkling-frozen-crop]"),
          ).toHaveCount(0);
          await expect
            .poll(() =>
              panel.evaluate(
                () =>
                  window.documentPictureInPicture.window?.document.querySelector<HTMLImageElement>(
                    ".capture-chip img",
                  )?.src,
              ),
            )
            .toMatch(/^data:image\/png/);
          await checkState();
          acceptedImage = await panel.evaluate(
            () =>
              window.documentPictureInPicture.window!.document.querySelector<HTMLImageElement>(
                ".capture-chip img",
              )!.src,
          );
          const pixels = await panel.evaluate(async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            return {
              size: [image.width, image.height],
              pixel: [...ctx.getImageData(40, 30, 1, 1).data],
            };
          }, acceptedImage);
          expect(pixels).toEqual({
            size: [80, 60],
            pixel: [255, 255, 255, 255],
          });
          await attachJson(testInfo, "production-accepted-crop-pixels", pixels);
          const path = testInfo.outputPath("production-accepted-crop.png");
          await writeFile(
            path,
            Buffer.from(acceptedImage.split(",")[1], "base64"),
          );
          await testInfo.attach("production-accepted-crop", {
            path,
            contentType: "image/png",
          });
        }
        await site.bringToFront();
        if (mode.includes("HiDPI") && !acceptedCrop) {
          await waitForInactiveCaptureGesture();
          nativeInput("chord", "Control_L", "Shift_L", "s");
        } else {
          await nativeClick(
            '.capture-buttons button[title="Crop the shared screen (Ctrl+Shift+S, or Cmd+Shift+S on Mac)"]',
            true,
          );
        }
        await attachJson(
          testInfo,
          "production-crop-controls",
          await panel.evaluate(() => {
            const view = window.documentPictureInPicture.window;
            const button = view?.document.querySelector(
              '.capture-buttons button[title^="Crop"]',
            );
            return {
              pip: Boolean(view),
              status: (view?.document || document).querySelector(".status")
                ?.textContent,
              rectangle: button?.getBoundingClientRect().toJSON(),
              dimensions: view && [
                view.screenX,
                view.screenY,
                view.innerWidth,
                view.innerHeight,
              ],
            };
          }),
        );
        await expect(
          panel.locator("[data-blinkling-frozen-crop]"),
        ).toBeVisible();
        await recordFullscreen(testInfo);
        expect(
          await panel.evaluate(
            () =>
              window.documentPictureInPicture.window ===
              (window as Window & { firstSharePiP: Window }).firstSharePiP,
          ),
        ).toBe(supportsMinimize);
        // Escape grants no activation. Expire the gesture and avoid CDP
        // activation until the preserved surface is available for recovery.
        if (!supportsMinimize) await panel.waitForTimeout(5500);
        nativeInput("key", "Escape");
        await expect(panel.locator("[data-blinkling-frozen-crop]")).toHaveCount(
          0,
        );
        await restoreFloatingSurface();
        await expect
          .poll(() =>
            panel.evaluate(() =>
              Boolean(
                window.documentPictureInPicture.window?.document.querySelector(
                  ".composer textarea",
                ),
              ),
            ),
          )
          .toBe(true);
        await checkState();
        // The native selector can disappear before asynchronous window/focus
        // restoration finishes. Wait for the production action to be ready.
        await expect
          .poll(() =>
            panel.evaluate(
              () =>
                window.documentPictureInPicture.window!.document.querySelector<HTMLButtonElement>(
                  '.capture-buttons button[title^="Crop"]',
                )!.disabled,
            ),
          )
          .toBe(false);
        if (acceptedCrop) {
          const savedPreview = () =>
            panel.evaluate(
              () =>
                window.documentPictureInPicture.window!.document.querySelector<HTMLImageElement>(
                  ".capture-chip img",
                )!.src,
            );
          expect(await savedPreview()).toBe(acceptedImage);
          // Exercise the actual production failure recovery after native fullscreen
          // refusal, keeping the successful capture rather than a transient frame.
          await panel.evaluate(() => {
            document.documentElement.requestFullscreen = async () => {
              throw new DOMException("Fullscreen refused", "NotAllowedError");
            };
            const update = chrome.windows.update.bind(chrome.windows);
            chrome.windows.update = ((
              id: number,
              change: chrome.windows.UpdateInfo,
            ) =>
              change.state === "fullscreen"
                ? Promise.reject(new Error("Native refusal"))
                : update(id, change)) as typeof chrome.windows.update;
          });
          await site.bringToFront();
          await nativeClick(
            '.capture-buttons button[title="Crop the shared screen (Ctrl+Shift+S, or Cmd+Shift+S on Mac)"]',
            true,
          );
          await expect(
            panel.locator("[data-blinkling-frozen-crop]"),
          ).toHaveCount(0);
          await expect
            .poll(() =>
              panel.evaluate(() =>
                Boolean(
                  window.documentPictureInPicture.window?.document.querySelector(
                    ".composer textarea",
                  ),
                ),
              ),
            )
            .toBe(true);
          await checkState();
          expect(await savedPreview()).toBe(acceptedImage);
          await expect(
            panel.locator("[data-blinkling-frozen-crop]"),
          ).toHaveCount(0);
          await expect
            .poll(() =>
              panel.evaluate(
                () =>
                  window.documentPictureInPicture.window!.document.querySelector(
                    ".status",
                  )?.textContent,
              ),
            )
            .toContain(en.crop_fullscreen_denied);
        }
        await site.bringToFront();
        await nativeClick(".composer button.send", true);
        await expect
          .poll(() =>
            panel.evaluate(
              () =>
                window.documentPictureInPicture.window?.document.querySelectorAll(
                  ".message .answer .markdown",
                ).length,
            ),
          )
          .toBe(2);
        await expect.poll(() => images.length).toBe(1);
        if (acceptedCrop) expect(images[0]).toBe(acceptedImage);
        else {
          const sourceWindowId = await panel.evaluate(
            async (url) =>
              (await chrome.tabs.query({})).find((tab) => tab.url === url)
                ?.windowId,
            site.url(),
          );
          const focusedWindowId = await panel.evaluate(
            async () =>
              (await chrome.windows.getAll()).find((native) => native.focused)
                ?.id,
          );
          // The user clicked this bubble. Returning focus to that same bubble
          // or its underlying source is safe; activating the opener is a jump.
          const currentBubbleId = await panel.evaluate(
            async () =>
              (await chrome.windows.getAll()).find((w) => w.alwaysOnTop)?.id,
          );
          expect([
            sourceWindowId,
            supportsMinimize ? bubbleWindowId : currentBubbleId,
          ]).toContain(focusedWindowId);
        }
        const pixel = await panel.evaluate(
          async ({ image, acceptedCrop }) => {
            const img = new Image();
            img.src = image;
            await img.decode();
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            return [
              ...ctx.getImageData(
                acceptedCrop ? 40 : 1360,
                acceptedCrop ? 30 : 920,
                1,
                1,
              ).data,
            ];
          },
          { image: images[0], acceptedCrop },
        );
        expect(pixel).toEqual(
          acceptedCrop ? [255, 255, 255, 255] : [17, 90, 154, 255],
        );
        expect(
          await panel.evaluate(
            () =>
              (window as Window & { savedTrack: MediaStreamTrack }).savedTrack
                .readyState,
          ),
        ).toBe("live");
        await expect.poll(nativeGeometry).toEqual(originalGeometry);
        await attachJson(testInfo, "production-window-geometry", {
          before: originalGeometry,
          after: await nativeGeometry(),
          windows: await panel.evaluate(() => chrome.windows.getAll()),
        });
        await panel.evaluate(() =>
          window.documentPictureInPicture.window!.close(),
        );
        await expect
          .poll(() =>
            panel.evaluate(
              () =>
                (window as Window & { savedTrack: MediaStreamTrack }).savedTrack
                  .readyState,
            ),
          )
          .toBe("ended");
      },
    );
  }
}

async function autoBubbleState() {
  return panel.evaluate(() => {
    const doc = window.documentPictureInPicture.window?.document;
    const video = document.querySelector("video")!;
    return {
      checked: doc
        ?.querySelector('[role="switch"]')
        ?.getAttribute("aria-checked"),
      consent: Boolean(doc?.querySelector(".screen-narration-consent")),
      status: doc?.querySelector(".toolbar .status")?.textContent,
      capture: doc?.querySelector<HTMLImageElement>(".capture-chip img")?.src,
      track: (video.srcObject as MediaStream | null)
        ?.getVideoTracks()[0]
        ?.getSettings(),
    };
  });
}

test("automatic explanation monitor: manual intent, consent, stable changes and stopping use a real desktop share", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  autoRequests = [];
  await nativeClick(".capture-buttons button:first-child", true);
  await expect
    .poll(async () => (await autoBubbleState()).capture, { timeout: 20000 })
    .toMatch(/^data:image\/png/);
  expect((await autoBubbleState()).checked).toBe("false");
  expect((await autoBubbleState()).track?.displaySurface).toBe("monitor");
  await panel.waitForTimeout(4500);
  expect(autoRequests.filter(({ request }) => request.image)).toHaveLength(0);
  await nativeClick('[role="switch"]', true);
  await expect.poll(async () => (await autoBubbleState()).consent).toBe(true);
  expect((await autoBubbleState()).checked).toBe("false");
  await panel.waitForTimeout(4500);
  expect(autoRequests.filter(({ request }) => request.image)).toHaveLength(0);
  await nativeClick(".screen-narration-consent .primary", true);
  await site.bringToFront();
  await expect
    .poll(() => autoRequests.filter(({ request }) => request.image).length, {
      timeout: 20000,
    })
    .toBe(1);
  expect(
    autoRequests.find(({ request }) => request.image)!.request.page,
  ).toBeUndefined();
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.answerReady);
  const first = autoRequests.find(({ request }) => request.image)!;
  await panel.waitForTimeout(5000);
  expect(autoRequests.filter(({ request }) => request.image)).toHaveLength(1);
  await site.evaluate(
    () =>
      (document.documentElement.style.background =
        "linear-gradient(90deg,#fff,#000)"),
  );
  await expect
    .poll(() => autoRequests.filter(({ request }) => request.image).length, {
      timeout: 20000,
    })
    .toBe(2);
  const second = autoRequests.filter(({ request }) => request.image)[1];
  expect(second.at - first.at).toBeGreaterThanOrEqual(
    10000 - autoRequestTimingTolerance,
  );
  expect(second.request.image!.equals(first.request.image!)).toBe(false);
  expect(second.request.page).toBeUndefined();
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.answerReady);
  await nativeClick('[role="switch"]', true);
  await expect
    .poll(async () => (await autoBubbleState()).checked)
    .toBe("false");
  expect((await autoBubbleState()).track).toBeUndefined();
  await site.evaluate(
    () =>
      (document.documentElement.style.background =
        "linear-gradient(90deg,#000,#fff)"),
  );
  await panel.waitForTimeout(4500);
  expect(autoRequests.filter(({ request }) => request.image)).toHaveLength(2);
  await attachFrame(testInfo, "first-auto-frame", first.request.image!);
  await attachFrame(testInfo, "changed-auto-frame", second.request.image!);
  await attachJson(testInfo, "monitor-auto-state", {
    state: await autoBubbleState(),
    times: autoRequests
      .filter(({ request }) => request.image)
      .map(({ at }) => at),
    pageAttached: false,
  });
});

test("automatic explanation tab: navigation and reload rebind the same real tab without another picker", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await nativeClick('[role="switch"]', true);
  await expect
    .poll(async () => (await autoBubbleState()).track?.displaySurface)
    .toBe("browser");
  await expect
    .poll(
      () =>
        autoRequests.filter(({ request }) =>
          request.page?.text.includes("ORIGINAL_DOCUMENT_ONLY"),
        ).length,
    )
    .toBeGreaterThan(0);
  autoRequests = [];
  await site.goto(`${autoOrigin}/next`);
  await expect
    .poll(
      () =>
        autoRequests.filter(({ request }) =>
          request.page?.text.includes("NEW_DOCUMENT_ONLY"),
        ).length,
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
  expect(
    autoRequests.filter(({ request }) =>
      request.page?.text.includes("ORIGINAL_DOCUMENT_ONLY"),
    ),
  ).toHaveLength(0);
  await site.evaluate(() => scrollTo(0, 700));
  expect(await site.evaluate(() => scrollY)).toBeGreaterThan(0);
  const beforeReload = autoRequests.length;
  await site.reload();
  await expect
    .poll(
      () =>
        autoRequests
          .slice(beforeReload)
          .filter(({ request }) =>
            request.page?.text.includes("NEW_DOCUMENT_ONLY"),
          ).length,
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
  const beforeCross = autoRequests.length;
  await site.goto(autoOrigin.replace("127.0.0.1", "localhost") + "/cross");
  await expect
    .poll(
      () =>
        autoRequests
          .slice(beforeCross)
          .filter(
            ({ request }) =>
              request.page?.url.includes("localhost") &&
              request.page.text.includes("NEW_DOCUMENT_ONLY"),
          ).length,
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
  const beforeBlocked = autoRequests.length;
  await site.goto(
    autoOrigin.replace("127.0.0.1", "blocked.blinkling.test") + "/blocked",
  );
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.blockedPage);
  await panel.waitForTimeout(4500);
  expect(autoRequests.slice(beforeBlocked)).toHaveLength(0);
  expect((await autoBubbleState()).checked).toBe("true");
  expect((await autoBubbleState()).consent).toBe(false);
  expect((await autoBubbleState()).track?.displaySurface).toBe("browser");
  await attachJson(testInfo, "tab-navigation-auto-state", {
    state: await autoBubbleState(),
    requests: autoRequests.map(({ request }) => ({
      page: request.page,
      image: Boolean(request.image),
    })),
  });
});

test("automatic explanation tab pixels: navigation sends only the new document's real frame", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await nativeClick('[role="switch"]', true);
  await expect
    .poll(() => autoRequests.filter(({ request }) => request.image).length, {
      timeout: 20000,
    })
    .toBe(1);
  const first = autoRequests.find(({ request }) => request.image)!;
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.answerReady);
  const beforeNavigation = autoRequests.length;
  await site.goto(`${autoOrigin}/next`);
  await expect
    .poll(() => autoRequests.filter(({ request }) => request.image).length, {
      timeout: 20000,
    })
    .toBe(2);
  const second = autoRequests.filter(({ request }) => request.image)[1];
  expect(second.at).toBeGreaterThan(first.at);
  expect(
    autoRequests.filter(({ request }) => request.kind === "passive").length,
  ).toBeLessThanOrEqual(6);
  expect(
    autoRequests
      .slice(beforeNavigation)
      .some(({ request }) =>
        request.page?.text.includes("ORIGINAL_DOCUMENT_ONLY"),
      ),
  ).toBe(false);
  expect(
    autoRequests
      .slice(beforeNavigation)
      .some(({ request }) => request.page?.text.includes("NEW_DOCUMENT_ONLY")),
  ).toBe(true);
  const luminance = async (frame: Buffer) =>
    panel.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const sample = (x: number) =>
        ctx.getImageData(
          Math.floor(image.width * x),
          Math.floor(image.height * 0.9),
          1,
          1,
        ).data[0];
      return [sample(0.1), sample(0.9)];
    }, frame.toString("base64"));
  const originalPixels = await luminance(first.request.image!);
  const newPixels = await luminance(second.request.image!);
  expect(originalPixels[1] - originalPixels[0]).toBeGreaterThan(150);
  expect(newPixels[0] - newPixels[1]).toBeGreaterThan(150);
  expect(second.request.page).toBeUndefined();
  await attachFrame(testInfo, "tab-original-frame", first.request.image!);
  await attachFrame(testInfo, "tab-new-document-frame", second.request.image!);
  await attachJson(testInfo, "tab-pixel-navigation", {
    originalPixels,
    newPixels,
    times: [first.at, second.at],
  });
});

test("automatic explanation app: a real native window requires consent and narrates its own changing pixels", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  autoRequests = [];
  await nativeClick('[role="switch"]', true);
  await expect
    .poll(async () => (await autoBubbleState()).track?.displaySurface)
    .toBe("window");
  await expect.poll(async () => (await autoBubbleState()).consent).toBe(true);
  await panel.waitForTimeout(4500);
  expect(autoRequests).toHaveLength(0);
  await nativeClick(".screen-narration-consent .primary", true);
  await expect
    .poll(() => autoRequests.filter(({ request }) => request.image).length, {
      timeout: 20000,
    })
    .toBe(1);
  const first = autoRequests[0];
  expect(first.request.page).toBeUndefined();
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.answerReady);
  narrationApp!.stdin!.write("flip\n");
  await expect
    .poll(() => autoRequests.filter(({ request }) => request.image).length, {
      timeout: 20000,
    })
    .toBe(2);
  const second = autoRequests[1];
  expect(second.at - first.at).toBeGreaterThanOrEqual(
    10000 - autoRequestTimingTolerance,
  );
  expect(second.request.image!.equals(first.request.image!)).toBe(false);
  expect(second.request.page).toBeUndefined();
  await attachFrame(testInfo, "native-app-first-frame", first.request.image!);
  await attachFrame(
    testInfo,
    "native-app-changed-frame",
    second.request.image!,
  );
  await stopProcess(narrationApp!);
  narrationApp = undefined;
  await expect
    .poll(async () => (await autoBubbleState()).checked)
    .toBe("false");
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.shareEnded);
});

test("automatic explanation tab privacy: embedded public text is explicit, passwords stay blocked and manual capture is reachable", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await nativeClick('[role="switch"]', true);
  await expect
    .poll(async () => (await autoBubbleState()).track?.displaySurface)
    .toBe("browser");
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.answerReady);
  await site.goto(`${autoOrigin}/embedded`);
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.privacyEmbedded);
  const beforeText = autoRequests.length;
  await panel.waitForTimeout(4500);
  expect(autoRequests).toHaveLength(beforeText);
  await nativeClick(".privacy-recovery button:first-child", true);
  await expect.poll(() => autoRequests.length).toBe(beforeText + 1);
  expect(autoRequests[beforeText].request.page?.text).toContain(
    "Public document",
  );
  expect(autoRequests[beforeText].request.image).toBeUndefined();
  await site.goto(`${autoOrigin}/password`);
  await expect
    .poll(async () => (await autoBubbleState()).status)
    .toBe(en.privacyPassword);
  expect(
    await panel.evaluate(
      () =>
        window.documentPictureInPicture.window!.document.querySelector(
          ".privacy-recovery",
        )!.textContent,
    ),
  ).not.toContain(en.autoExplainPageText);
  const beforePassword = autoRequests.length;
  await panel.waitForTimeout(4500);
  expect(autoRequests).toHaveLength(beforePassword);
  await nativeClick(".privacy-recovery button", true);
  await expect
    .poll(async () => (await autoBubbleState()).capture, { timeout: 20000 })
    .toMatch(/^data:image\/png/);
  expect(autoRequests).toHaveLength(beforePassword);
  await attachJson(testInfo, "privacy-recovery-state", await autoBubbleState());
});
