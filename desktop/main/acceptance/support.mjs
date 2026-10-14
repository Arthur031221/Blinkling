import { _electron as electron } from "@playwright/test";
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
      GLIMPSELET_TEST_DATA: userData,
    },
  });
  await app.evaluate(({ nativeTheme }, theme) => {
    nativeTheme.themeSource = theme;
  }, theme);
  const page = await app.firstWindow();
  page.on("pageerror", (error) => process.stderr.write(`${error.stack}\n`));
  await page.waitForFunction(() => window.desktop);
  await page.emulateMedia({ colorScheme: theme });
  return { app, page, data: userData };
}
export function native(events) {
  execFileSync("python3", [
    "-c",
    `import ctypes,time
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;d=x.XOpenDisplay(None)
assert d
x.XCloseDisplay.argtypes=[ctypes.c_void_p];x.XFlush.argtypes=[ctypes.c_void_p]
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
try:
 ${events.map((e) => (e.type === "move" ? `t.XTestFakeMotionEvent(d,-1,${Math.round(e.x)},${Math.round(e.y)},0);x.XFlush(d);time.sleep(${e.wait ?? 0.12})` : e.type === "wait" ? `time.sleep(${e.seconds})` : `t.XTestFakeButtonEvent(d,1,${e.type === "down" ? 1 : 0},0);x.XFlush(d);time.sleep(.08)`)).join("\n ")}
finally:x.XCloseDisplay(d)`,
  ]);
}
export const move = (x, y) => native([{ type: "move", x, y }]);
export const click = (x, y) =>
  native([{ type: "move", x, y }, { type: "down" }, { type: "up" }]);
