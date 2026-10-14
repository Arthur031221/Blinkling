import { _electron as electron, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const report =
  process.env.GLIMPSELET_REPORT_DIR ??
  join(tmpdir(), "glimpselet-shell-report");
export async function launch({ scale = 1, theme = "light", data } = {}) {
  await mkdir(report, { recursive: true });
  const userData = data ?? (await mkdtemp(join(tmpdir(), "blink-e2e-")));
  const app = await electron.launch({
    args: [
      fileURLToPath(new URL("../..", import.meta.url)),
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--force-device-scale-factor=${scale}`,
    ],
    env: {
      ...process.env,
      GLIMPSELET_E2E: "1",
      GLIMPSELET_REMOTE: process.env.GLIMPSELET_REMOTE ?? "0",
      GLIMPSELET_TEST_DATA: userData,
      GLIMPSELET_REMOTE: "0",
    },
  });
  await app.evaluate(({ nativeTheme }, theme) => {
    nativeTheme.themeSource = theme;
  }, theme);
  const page = await app.firstWindow();
  page.on("pageerror", (error) => process.stderr.write(`${error.stack}\n`));
  await page.waitForFunction(() => window.desktop);
  await expect
    .poll(() => app.evaluate(() => !!globalThis.glimpseletTest))
    .toBe(true);
  await page.emulateMedia({ colorScheme: theme });
  return { app, page, data: userData };
}
const python = (e) =>
  e.type === "move"
    ? `t.XTestFakeMotionEvent(d,-1,${Math.round(e.x)},${Math.round(e.y)},0);x.XFlush(d);time.sleep(${e.wait ?? 0.12})`
    : e.type === "wait"
      ? `time.sleep(${e.seconds})`
      : e.type === "wheel"
        ? // Buttons 4 and 5 are the X11 wheel; one press is one notch.
          `for _ in range(${Math.abs(e.notches)}):\n  t.XTestFakeButtonEvent(d,${e.notches < 0 ? 4 : 5},1,0);x.XFlush(d);time.sleep(.03);t.XTestFakeButtonEvent(d,${e.notches < 0 ? 4 : 5},0,0);x.XFlush(d);time.sleep(.05)`
        : e.type === "key"
          ? `k=x.XKeysymToKeycode(d,${e.keysym});t.XTestFakeKeyEvent(d,k,1,0);t.XTestFakeKeyEvent(d,k,0,0);x.XFlush(d);time.sleep(.08)`
          : e.type === "keys"
            ? `for ch in ${JSON.stringify(e.text)}:\n  k=x.XKeysymToKeycode(d,ord(ch))\n  t.XTestFakeKeyEvent(d,k,1,0);t.XTestFakeKeyEvent(d,k,0,0);x.XFlush(d);time.sleep(.04)`
            : `t.XTestFakeButtonEvent(d,1,${e.type === "down" ? 1 : 0},0);x.XFlush(d);time.sleep(.08)`;
export function native(events) {
  execFileSync("python3", [
    "-c",
    `import ctypes,time
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;d=x.XOpenDisplay(None)
assert d
x.XCloseDisplay.argtypes=[ctypes.c_void_p];x.XFlush.argtypes=[ctypes.c_void_p]
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
try:
 ${events.map(python).join("\n ")}
finally:x.XCloseDisplay(d)`,
  ]);
}
export const move = (x, y) => native([{ type: "move", x, y }]);
export const click = (x, y) =>
  native([{ type: "move", x, y }, { type: "down" }, { type: "up" }]);
export const wheel = (x, y, notches) =>
  native([
    { type: "move", x, y },
    { type: "wheel", notches },
  ]);
export const keys = (text) => native([{ type: "keys", text }]);
export const key = (keysym) => native([{ type: "key", keysym }]);
