import { _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
export function launch() {
  return electron.launch({
    ...(process.env.GLIMPSELET_TEST_EXECUTABLE
      ? { executablePath: process.env.GLIMPSELET_TEST_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.GLIMPSELET_TEST_EXECUTABLE
        ? []
        : [fileURLToPath(new URL("..", import.meta.url))]),
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    ],
    env: {
      ...process.env,
      GLIMPSELET_E2E: "1",
      GLIMPSELET_REMOTE: process.env.GLIMPSELET_REMOTE ?? "0",
    },
  });
}
export function nativeClick(x, y) {
  execFileSync("python3", [
    "-c",
    `import ctypes,time
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;d=x.XOpenDisplay(None)
assert d
x.XCloseDisplay.argtypes=[ctypes.c_void_p];x.XFlush.argtypes=[ctypes.c_void_p]
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
try:
 t.XTestFakeMotionEvent(d,-1,${x},${y},0);x.XFlush(d);time.sleep(.15)
 t.XTestFakeButtonEvent(d,1,1,0);t.XTestFakeButtonEvent(d,1,0,0);x.XFlush(d);time.sleep(.1)
finally:x.XCloseDisplay(d)`,
  ]);
}
