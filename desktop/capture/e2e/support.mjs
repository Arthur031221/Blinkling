import { _electron as electron, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const reports =
  process.env.GLIMPSELET_REPORT_DIR ??
  fileURLToPath(
    new URL("../../../test-results/capture-guide", import.meta.url),
  );
export async function launch(scale = 1) {
  await mkdir(reports, { recursive: true });
  const dir = await mkdtemp(join(tmpdir(), "glimpse-b3-"));
  const app = await electron.launch({
    args: [
      fileURLToPath(new URL("./main.cjs", import.meta.url)),
      "--no-sandbox",
      `--force-device-scale-factor=${scale}`,
      `--user-data-dir=${dir}`,
    ],
    env: { ...process.env, GLIMPSELET_E2E: "1" },
  });
  await app.firstWindow();
  await expect
    .poll(() => app.evaluate(() => !!globalThis.glimpseletTest), {
      timeout: 10000,
    })
    .toBe(true);
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
export async function background(app) {
  return app.evaluate(async ({ BrowserWindow, screen }) => {
    const d = screen.getPrimaryDisplay();
    const win = new BrowserWindow({
      ...d.bounds,
      frame: false,
      show: false,
      backgroundColor: "#204080",
    });
    await win.loadURL(
      "data:text/html," +
        encodeURIComponent(
          '<body style="margin:0;background:#204080;color:white;font:16px system-ui"><h1 style="margin:24px">Desktop report</h1><div id="target" style="position:absolute;left:240px;top:160px;width:160px;height:100px;background:#e84949;display:grid;place-items:center">Main result</div><script>window.clicks=[];addEventListener("click",e=>clicks.push([e.screenX,e.screenY]))</script>',
        ),
    );
    win.show();
    globalThis.b3Background = win;
    return {
      bounds: d.bounds,
      scale: d.scaleFactor,
      blink: globalThis.glimpseletTest.blink.getBounds(),
    };
  });
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
