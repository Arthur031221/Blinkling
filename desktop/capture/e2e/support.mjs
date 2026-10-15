import { _electron as electron, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { execFileSync } from "../../main/e2e/exec.mjs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const reports =
  process.env.BLINKLING_REPORT_DIR ??
  fileURLToPath(
    new URL("../../../test-results/capture-guide", import.meta.url),
  );
export async function launch(scale = 1, { lang } = {}) {
  await mkdir(reports, { recursive: true });
  const dir = await mkdtemp(join(tmpdir(), "glimpse-b3-"));
  const app = await electron.launch({
    args: [
      fileURLToPath(new URL("./main.cjs", import.meta.url)),
      "--no-sandbox",
      `--force-device-scale-factor=${scale}`,
      `--user-data-dir=${dir}`,
      ...(lang ? [`--lang=${lang}`] : []),
    ],
    env: {
      ...process.env,
      BLINKLING_E2E: "1",
      BLINKLING_REMOTE: "0",
      ...(lang ? { LANGUAGE: lang, LC_ALL: lang.replace("-", "_") } : {}),
    },
  });
  await app.firstWindow();
  await expect
    .poll(() => app.evaluate(() => !!globalThis.blinklingTest?.features), {
      timeout: 10000,
    })
    .toBe(true);
  // The overlays and the hotkey are set up before the first capture.
  await app.evaluate(() => globalThis.blinklingTest.features.ready);
  return {
    app,
    close: async () => {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
export function native(x, y, keys = [], { hover = false } = {}) {
  execFileSync("python3", [
    "-c",
    `import ctypes,time
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;d=x.XOpenDisplay(None)
assert d
x.XCloseDisplay.argtypes=[ctypes.c_void_p];x.XFlush.argtypes=[ctypes.c_void_p];x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong];t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong];t.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
try:
 t.XTestFakeMotionEvent(d,-1,${Math.round(x)},${Math.round(y)},0);x.XFlush(d);time.sleep(.12)
 keys=${JSON.stringify(keys)}
 if keys:
  for k in keys:t.XTestFakeKeyEvent(d,x.XKeysymToKeycode(d,k),1,0)
  if ${hover ? "True" : "False"}:
   t.XTestFakeMotionEvent(d,-1,${Math.round(x) + 1},${Math.round(y) + 1},0);x.XFlush(d);time.sleep(.25)
  for k in reversed(keys):t.XTestFakeKeyEvent(d,x.XKeysymToKeycode(d,k),0,0)
 else:
  t.XTestFakeButtonEvent(d,1,1,0);t.XTestFakeButtonEvent(d,1,0,0)
 x.XFlush(d);time.sleep(.12)
finally:x.XCloseDisplay(d)`,
  ]);
}
export async function nativeBounds(app, name) {
  const id = await app.evaluate(
    (_electron, name) =>
      globalThis[name].getNativeWindowHandle().readUInt32LE(0),
    name,
  );
  const result = execFileSync("xwininfo", ["-id", String(id), "-stats"], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  const field = (label) =>
    Number(result.match(new RegExp(`${label}:\\s*(-?\\d+)`))[1]);
  return {
    x: field("Absolute upper-left X"),
    y: field("Absolute upper-left Y"),
    width: field("Width"),
    height: field("Height"),
  };
}
export async function background(app, color = "#204080") {
  return app.evaluate(async ({ BrowserWindow, screen }, color) => {
    const d = screen.getPrimaryDisplay();
    const win = new BrowserWindow({
      ...d.bounds,
      frame: false,
      show: false,
      backgroundColor: color,
    });
    await win.loadURL(
      "data:text/html," +
        encodeURIComponent(
          `<body style="margin:0;background:${color};color:white;font:16px system-ui"><h1 style="margin:24px">Desktop report</h1><div id="target" style="position:absolute;left:240px;top:160px;width:160px;height:100px;background:#e84949;display:grid;place-items:center">Main result</div><script>window.clicks=[];addEventListener("click",e=>clicks.push([e.screenX,e.screenY]))</script>`,
        ),
    );
    win.show();
    globalThis.b3Background = win;
    return {
      bounds: d.bounds,
      scale: d.scaleFactor,
      // The shell's transparent window spans the display. Only the native
      // character/menu input regions occupy pixels that labels must avoid.
      blink: globalThis.blinklingTest.blink.getBounds(),
      blinkRegions: globalThis.blinklingTest.visualMasks(),
    };
  }, color);
}
export async function desktopShot(app, name) {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const base64 = await app.evaluate(async ({ desktopCapturer, screen }) => {
    const d = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(d.bounds.width * d.scaleFactor),
        height: Math.round(d.bounds.height * d.scaleFactor),
      },
    });
    return sources[0].thumbnail.toPNG().toString("base64");
  });
  const bytes = Buffer.from(base64, "base64");
  await writeFile(join(reports, name + ".png"), bytes);
  return bytes;
}
export async function nextWindow(app, task) {
  const before = new Set(app.windows());
  await task();
  let page;
  // Electron may publish a previously created background window late. Match
  // the actual loaded feature page instead of assuming the next event is it.
  await expect
    .poll(
      () => {
        page = app
          .windows()
          .find(
            (p) =>
              !before.has(p) &&
              /^file:.*\/desktop\/(capture|overlay)\/[^/]+\.html$/.test(
                p.url(),
              ),
          );
        return !!page;
      },
      { timeout: 10000 },
    )
    .toBe(true);
  await page.waitForLoadState();
  return page;
}
const electronPath = createRequire(import.meta.url)("electron");
/** A real window of another application, on screen at the given DIP bounds.
 * A title ending in " - Google Chrome" makes it look like a browser to the
 * window list (Electron cannot set a window's X11 class). */
export async function spawnWindow({ x, y, width, height, color, title }, dir) {
  const child = spawn(
    electronPath,
    [
      fileURLToPath(new URL("./window.cjs", import.meta.url)),
      "--no-sandbox",
      `--user-data-dir=${join(dir, title)}`,
    ],
    {
      env: {
        ...process.env,
        BLINKLING_TEST_WINDOW: JSON.stringify({
          x,
          y,
          width,
          height,
          color,
          title,
        }),
      },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => reject(Error("window process exited")));
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("ready")) resolve();
    });
  });
  return {
    child,
    close: () => child.kill("SIGKILL"),
  };
}
/** The capture overlay page of the (single) test display. */
export const overlayPage = (app) =>
  app.windows().find((p) => /\/capture\/selection\.html$/.test(p.url()));
export async function openOverlay(app, blink) {
  await blink.evaluate(() => void window.blinkling.action("capture"));
  await expect.poll(() => !!overlayPage(app), { timeout: 10000 }).toBe(true);
  const page = overlayPage(app);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect
    .poll(() =>
      app.evaluate(() =>
        globalThis.blinklingTest.features.capture.overlays.windows.some((w) =>
          w.isVisible(),
        ),
      ),
    )
    .toBe(true);
  return page;
}
/** Route every delivered capture into `globalThis.taken` instead of the card. */
export const collectTaken = (app) =>
  app.evaluate(() => {
    const capture = globalThis.blinklingTest.features.capture;
    globalThis.taken = [];
    capture.onCapture = async (taken) => void globalThis.taken.push(taken);
  });
export const taken = (app) =>
  app.evaluate(() =>
    (globalThis.taken ?? []).map(({ image, ...rest }) => ({
      ...rest,
      bytes: image?.data?.length ?? 0,
    })),
  );
/** Mean luminance (0-255) of every frame the X server shows while `task`
 * runs, recorded at 60 fps. */
export async function recordLuminance(
  task,
  { width = 1280, height = 800 } = {},
) {
  const log = join(
    tmpdir(),
    `blinkling-frames-${process.pid}-${Date.now()}.txt`,
  );
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "x11grab",
      "-framerate",
      "60",
      "-video_size",
      `${width}x${height}`,
      "-i",
      process.env.DISPLAY,
      "-vf",
      `scale=160:100,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=${log}`,
      "-f",
      "null",
      "-",
    ],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  await new Promise((resolve) => setTimeout(resolve, 700));
  try {
    await task();
    await new Promise((resolve) => setTimeout(resolve, 400));
  } finally {
    ffmpeg.stdin.write("q");
    await new Promise((resolve) => ffmpeg.once("exit", resolve));
  }
  const values = [...readFileSync(log, "utf8").matchAll(/YAVG=([\d.]+)/g)].map(
    (m) => Number(m[1]),
  );
  await rm(log, { force: true });
  return values;
}
