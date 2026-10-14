import { expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { PNG } from "pngjs";
import { report } from "./artifacts.mjs";
export { report };
export function native(x, y, button = null) {
  const result = execFileSync("python3", [
    "-c",
    `import ctypes,time
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;d=x.XOpenDisplay(None)
assert d
x.XFlush.argtypes=[ctypes.c_void_p];x.XCloseDisplay.argtypes=[ctypes.c_void_p]
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
try:
 t.XTestFakeMotionEvent(d,-1,${Math.round(x)},${Math.round(y)},0);x.XFlush(d);time.sleep(.08)
 x.XDefaultRootWindow.argtypes=[ctypes.c_void_p];x.XDefaultRootWindow.restype=ctypes.c_ulong
 x.XQueryPointer.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_uint)]
 root=ctypes.c_ulong();child=ctypes.c_ulong();rx=ctypes.c_int();ry=ctypes.c_int();wx=ctypes.c_int();wy=ctypes.c_int();mask=ctypes.c_uint()
 x.XQueryPointer(d,x.XDefaultRootWindow(d),ctypes.byref(root),ctypes.byref(child),ctypes.byref(rx),ctypes.byref(ry),ctypes.byref(wx),ctypes.byref(wy),ctypes.byref(mask))
 ${button === null ? "pass" : button === "click" ? "t.XTestFakeButtonEvent(d,1,1,0);x.XFlush(d);time.sleep(.05);t.XTestFakeButtonEvent(d,1,0,0)" : `t.XTestFakeButtonEvent(d,1,${button === "down" ? 1 : 0},0)`}
 x.XFlush(d);time.sleep(.05)
 x.XGetInputFocus.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int)];focus=ctypes.c_ulong();revert=ctypes.c_int();x.XGetInputFocus(d,ctypes.byref(focus),ctypes.byref(revert))
 print(child.value,mask.value,focus.value)
finally:x.XCloseDisplay(d)`,
  ]);
  return result.toString().trim();
}
export function activeWindow() {
  return Number(
    execFileSync("python3", [
      "-c",
      `import ctypes
x=ctypes.CDLL('libX11.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;d=x.XOpenDisplay(None)
assert d
x.XDefaultRootWindow.argtypes=[ctypes.c_void_p];x.XDefaultRootWindow.restype=ctypes.c_ulong
x.XInternAtom.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int];x.XInternAtom.restype=ctypes.c_ulong
x.XGetWindowProperty.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_long,ctypes.c_long,ctypes.c_int,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_void_p)]
x.XFree.argtypes=[ctypes.c_void_p];x.XCloseDisplay.argtypes=[ctypes.c_void_p]
data=ctypes.c_void_p();kind=ctypes.c_ulong();fmt=ctypes.c_int();count=ctypes.c_ulong();remaining=ctypes.c_ulong()
try:
 atom=x.XInternAtom(d,b'_NET_ACTIVE_WINDOW',0)
 assert x.XGetWindowProperty(d,x.XDefaultRootWindow(d),atom,0,1,0,0,ctypes.byref(kind),ctypes.byref(fmt),ctypes.byref(count),ctypes.byref(remaining),ctypes.byref(data))==0
 print(ctypes.cast(data,ctypes.POINTER(ctypes.c_ulong))[0] if fmt.value==32 and count.value else 0)
finally:
 if data:x.XFree(data)
 x.XCloseDisplay(d)`,
    ])
      .toString()
      .trim(),
  );
}
export async function launch(scale = 1, theme = "light", data = null) {
  await mkdir(report, { recursive: true });
  const directory =
    data ?? (await mkdtemp(join(tmpdir(), "glimpselet-shell-")));
  const app = await electron.launch({
    args: [
      ...(process.env.GLIMPSELET_TEST_EXECUTABLE
        ? []
        : [fileURLToPath(new URL("../..", import.meta.url))]),
      "--no-sandbox",
      `--force-device-scale-factor=${scale}`,
    ],
    ...(process.env.GLIMPSELET_TEST_EXECUTABLE
      ? { executablePath: process.env.GLIMPSELET_TEST_EXECUTABLE }
      : {}),
    env: {
      ...process.env,
      GLIMPSELET_E2E: "1",
      GLIMPSELET_REMOTE: "0",
      GLIMPSELET_TEST_DATA: directory,
    },
  });
  const page = await app.firstWindow();
  app.process().stderr.on("data", (bytes) => {
    void appendFile(join(report, "electron-stderr.log"), bytes);
  });
  await expect(page.getByRole("img", { name: "Blink" })).toBeVisible();
  await expect(page.locator("#blink")).toHaveAttribute(
    "data-mode",
    /peek|hover/,
  );
  await expect
    .poll(() => app.evaluate(() => !!globalThis.glimpseletTest))
    .toBe(true);
  await app.evaluate(({ nativeTheme }, theme) => {
    nativeTheme.themeSource = theme;
  }, theme);
  return {
    app,
    page,
    directory,
    close: async () => {
      await app.close();
      if (!data) await rm(directory, { recursive: true, force: true });
    },
  };
}
export async function desktopShot(app, name) {
  const base64 = await app.evaluate(async ({ desktopCapturer, screen }) => {
    const id = globalThis.glimpseletTest.snapshot().display.id;
    const d = screen.getAllDisplays().find((d) => String(d.id) === id);
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(d.bounds.width * d.scaleFactor),
        height: Math.round(d.bounds.height * d.scaleFactor),
      },
    });
    return sources
      .find((s) => s.display_id === id)
      .thumbnail.toPNG()
      .toString("base64");
  });
  const bytes = Buffer.from(base64, "base64");
  await writeFile(join(report, name + ".png"), bytes);
  return PNG.sync.read(bytes);
}
export const pixel = (image, x, y) =>
  Array.from(
    image.data.subarray(
      (Math.round(y) * image.width + Math.round(x)) * 4,
      (Math.round(y) * image.width + Math.round(x)) * 4 + 3,
    ),
  );
export async function rigPoint(page) {
  return page.evaluate(() => {
    const r = document
      .querySelector('rect[fill="#3ddc97"]')
      .getBoundingClientRect();
    return {
      x: r.x + r.width * (r.x < 0 ? 0.8 : 0.2),
      y: r.y + r.height * 0.72,
    };
  });
}
export async function moveOn(page, scale = 1) {
  const p = await rigPoint(page);
  native(p.x * scale, p.y * scale);
  await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
  await page.waitForTimeout(550);
}
export async function background(app, fullscreen = false) {
  await app.evaluate(async ({ BrowserWindow, screen }, full) => {
    const w = new BrowserWindow({
      ...screen.getPrimaryDisplay().bounds,
      frame: false,
      show: false,
      backgroundColor: "#204080",
    });
    await w.loadURL(
      "data:text/html," +
        encodeURIComponent(
          '<body style="background:#204080;margin:0"><div style="position:absolute;left:400px;top:200px;width:100px;height:80px;background:red"></div><script>window.clicks=[];addEventListener("click",e=>clicks.push([e.screenX,e.screenY]))</script>',
        ),
    );
    w.show();
    if (full) w.setFullScreen(true);
    globalThis.shellBackground = w;
  }, fullscreen);
}
