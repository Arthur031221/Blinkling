import { launchExtensionContext } from "./browser";
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

function nativeInput(...args: string[]) {
  execFileSync("python3", ["-c", xInput, ...args], {
    env: { ...process.env, DISPLAY: display },
  });
}

async function nativeClick(selector: string, bubble = false) {
  if (!bubble) await panel.bringToFront();
  await expect
    .poll(() =>
      panel.evaluate(
        ({ bubble, selector }) => {
          const view = bubble ? window.documentPictureInPicture.window : window;
          return Boolean(view?.document.querySelector(selector));
        },
        { bubble, selector },
      ),
    )
    .toBe(true);
  await panel.evaluate(
    async ({ bubble, selector }) => {
      const view = bubble ? window.documentPictureInPicture.window! : window;
      view.focus();
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
        const view = bubble ? window.documentPictureInPicture.window! : window;
        return view.document.hasFocus();
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
            ? window.documentPictureInPicture.window!
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
            ? window.documentPictureInPicture.window!
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
  directory = await mkdtemp(join(tmpdir(), "glimpselet-native-screen-"));
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
  if (testInfo.title.startsWith("production chat")) {
    // Exercise the current production entry point and source libraries without
    // regenerating the distributed plugin artifacts owned by integration.
    await build({
      entryPoints: [resolve("extension/main.tsx")],
      outdir: extension,
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "chrome116",
      legalComments: "none",
      jsx: "automatic",
      loader: { ".ttf": "file", ".svg": "file" },
      assetNames: "assets/[name]",
      define: { "process.env.NODE_ENV": '"production"' },
    });
  }
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
import { listenForShiftCrop } from './shift-crop';
import * as captureApi from './capture';
window.captureWeb = captureApi.captureWeb;
window.retryPendingWebCapture = captureApi.retryPendingWebCapture;
window.setCurrentActiveTab = captureApi.setCurrentActiveTab;
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
const options = () => window.useClearBubble ? { clearBubble } : undefined;
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
  cropSharedScreen(video, window.useClearBubble ? pip.document : null, labels, options())
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
  if (message.type === 'glimpselet:command' && message.command === 'crop-screen') startCrop();
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
      "--window-size=1200,900",
      `--force-device-scale-factor=${dpi}`,
      "--auto-select-desktop-capture-source=Entire screen",
      ...(testInfo.title.includes("dedicated")
        ? ["--enable-features=ExcludePipFromScreenCapture"]
        : ["--disable-features=ExcludePipFromScreenCapture"]),
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.local.set({ consented: true, locale: "en" }),
  );
  panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${new URL(worker.url()).host}/native-fixture.html`,
  );
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
    await site.goto(`http://127.0.0.1:${address.port}/`);
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
    expect(access).toEqual({ site: true, allSites: false });
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
      await stopProcess(desktop);
      await testInfo.attach("desktop-startup", {
        body: `${browserName}\n${desktopLog}\n${managerLog}`,
        contentType: "text/plain",
      });
      if (directory) await rm(directory, { recursive: true, force: true });
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
    const result = await panel.evaluate(async (kind) => {
      return Promise.race([
        (window as NativeFixture).captureWeb(kind).then(
          () => "unexpected capture",
          (error: Error) => error.message,
        ),
        new Promise<string>((resolve) =>
          setTimeout(
            () => resolve("selection opened before authorization"),
            1500,
          ),
        ),
      ]);
    }, kind);

    expect(result).toBe("capture_permission");
    await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
    await expect(site.locator("[data-glimpselet-overlay] .shade")).toHaveCount(
      0,
    );
  });
}

async function retainDeniedSelection() {
  const denial = await panel.evaluate(async () => {
    const fixture = window as NativeFixture;
    try {
      await fixture.captureWeb("region", [60, 100, 180, 120]);
      return { message: "unexpected capture" };
    } catch (error) {
      const failure = error as Error & { pending?: PendingWebCapture };
      fixture.pending = failure.pending;
      return { message: failure.message, pending: failure.pending };
    }
  });
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
  await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
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
    await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
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
        .querySelector("[data-glimpselet-frozen-crop] img")!
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
      const frozen = panel.locator("[data-glimpselet-frozen-crop]");
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
    const frozen = panel.locator("[data-glimpselet-frozen-crop]");
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
    const frozen = panel.locator("[data-glimpselet-frozen-crop]");
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
  const frozen = panel.locator("[data-glimpselet-frozen-crop]");
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
    const frozen = panel.locator("[data-glimpselet-frozen-crop]");
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

for (const mode of ["unpacked", "dedicated"]) {
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
        await nativeClick(
          '.capture-buttons button[title="Share a screen"]',
          true,
        );
        await expect(panel.locator(".capture-reopen button")).toBeVisible();
        expect(
          await panel.evaluate(() => window.documentPictureInPicture.window),
        ).toBeNull();
        await nativeClick(".capture-reopen button");
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
        const checkState = async () => {
          expect(
            await panel.evaluate(() => {
              const saved = window as Window & {
                savedVideo: HTMLVideoElement;
                savedTrack: MediaStreamTrack;
              };
              const doc = window.documentPictureInPicture.window!.document;
              return {
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
            sameVideo: true,
            sameTrack: true,
            live: "live",
            draft: "Keep this draft and conversation",
            history: "Native answer",
          });
        };
        await checkState();
        let acceptedImage: string | undefined;
        if (acceptedCrop) {
          await site.bringToFront();
          await nativeClick(
            '.capture-buttons button[title="Crop the shared screen (Ctrl+Shift+S, or Cmd+Shift+S on Mac)"]',
            true,
          );
          const frozen = panel.locator("[data-glimpselet-frozen-crop]");
          await expect(frozen.locator(".surface")).toBeVisible();
          nativeInput("pointer", "60", "140", "down");
          nativeInput("pointer", "140", "200", "move");
          nativeInput("pointer", "140", "200", "up");
          await expect(frozen.locator("[data-handle]")).toHaveCount(8);
          nativeInput("keys", "Return");
          await expect(panel.locator(".capture-reopen button")).toBeVisible();
          await nativeClick(".capture-reopen button");
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
        await nativeClick(
          '.capture-buttons button[title="Crop the shared screen (Ctrl+Shift+S, or Cmd+Shift+S on Mac)"]',
          true,
        );
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
          panel.locator("[data-glimpselet-frozen-crop]"),
        ).toBeVisible();
        expect(
          await panel.evaluate(() => window.documentPictureInPicture.window),
        ).toBeNull();
        nativeInput("key", "Escape");
        await expect(panel.locator(".capture-reopen button")).toBeVisible();
        await nativeClick(".capture-reopen button");
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
          await expect(panel.locator(".capture-reopen button")).toBeVisible();
          await nativeClick(".capture-reopen button");
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
            panel.locator("[data-glimpselet-frozen-crop]"),
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
        if (!acceptedCrop) {
          await expect(panel.locator(".capture-reopen button")).toBeVisible();
          await nativeClick(".capture-reopen button");
        }
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
