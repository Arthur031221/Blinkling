import { _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const desktop = fileURLToPath(new URL("../..", import.meta.url));

/** Starts the real shell. `scale` is the device scale factor the whole run uses. */
export async function launch({ scale = 1, env = {} } = {}) {
  const app = await electron.launch({
    args: [
      desktop,
      "--no-sandbox",
      ...(scale === 1 ? [] : [`--force-device-scale-factor=${scale}`]),
    ],
    env: {
      ...process.env,
      BLINKLING_E2E: "1",
      // Automated runs never create Remote Control sessions.
      BLINKLING_REMOTE: "0",
      BLINKLING_TEST_SESSION: "manual",
      ...env,
    },
  });
  await poll(
    () => app.evaluate(() => Boolean(globalThis.blinklingTest?.pick)),
    20000,
    "pick hook",
  );
  return app;
}

export async function poll(fn, timeout = 10000, label = "condition") {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 40));
  }
}

const KEYS = {
  ctrl: "Control_L",
  shift: "Shift_L",
  esc: "Escape",
  enter: "Return",
  c: "c",
  v: "v",
  tab: "Tab",
  alt: "Alt_L",
};

/** Real X input through XTest, in physical pixels. Returns the epoch ms at which
 * each key went down. A step is one of
 *  ["down", key] ["up", key] ["key", key] ["move", x, y] ["press"] ["release"]
 *  ["wheel", 1|-1] ["wait", ms] ["drag", x0, y0, x1, y1, ms]. */
export function input(steps) {
  const lines = steps.map(([op, a, b, c, d, e]) => {
    switch (op) {
      case "down":
        return `key(${JSON.stringify(KEYS[a] ?? a)}, 1); print(time.time() * 1000)`;
      case "up":
        return `key(${JSON.stringify(KEYS[a] ?? a)}, 0)`;
      case "key":
        return `key(${JSON.stringify(KEYS[a] ?? a)}, 1); key(${JSON.stringify(KEYS[a] ?? a)}, 0)`;
      case "move":
        return `move(${a}, ${b})`;
      case "press":
        return "button(1, 1)";
      case "release":
        return "button(1, 0)";
      case "wheel":
        return `button(${a > 0 ? 4 : 5}, 1); button(${a > 0 ? 4 : 5}, 0); flush()`;
      case "wait":
        return `time.sleep(${a / 1000})`;
      case "drag":
        return `drag(${a}, ${b}, ${c}, ${d}, ${e})`;
      default:
        throw new Error(`Unknown input step ${op}`);
    }
  });
  const script = `import ctypes, time
x = ctypes.CDLL('libX11.so.6'); t = ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.restype = ctypes.c_void_p
x.XStringToKeysym.restype = ctypes.c_ulong
x.XKeysymToKeycode.restype = ctypes.c_ubyte
x.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x.XFlush.argtypes = [ctypes.c_void_p]
x.XCloseDisplay.argtypes = [ctypes.c_void_p]
t.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
t.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
d = x.XOpenDisplay(None)
assert d
def flush(): x.XFlush(d)
def key(name, down):
    code = x.XKeysymToKeycode(d, x.XStringToKeysym(name.encode()))
    t.XTestFakeKeyEvent(d, code, down, 0); flush()
def move(px, py):
    t.XTestFakeMotionEvent(d, -1, px, py, 0); flush()
def button(n, down):
    t.XTestFakeButtonEvent(d, n, down, 0); flush()
def drag(x0, y0, x1, y1, ms):
    steps = max(2, int(ms / 16))
    move(x0, y0); time.sleep(0.03); button(1, 1); time.sleep(0.03)
    for i in range(1, steps + 1):
        move(round(x0 + (x1 - x0) * i / steps), round(y0 + (y1 - y0) * i / steps)); time.sleep(0.016)
    time.sleep(0.05); button(1, 0)
try:
${lines.map((l) => `    ${l}; time.sleep(0.02)`).join("\n")}
    flush()
finally:
    x.XCloseDisplay(d)
`;
  const out = execFileSync("python3", ["-I", "-c", script]).toString().trim();
  return out ? out.split("\n").map(Number) : [];
}

/** A screenshot of the whole composited screen, taken by the app itself: the
 * X root window stays black under a compositing window manager. */
export async function shot(app, file) {
  const base64 = await app.evaluate(async ({ desktopCapturer, screen }) => {
    const { size, scaleFactor } = screen.getPrimaryDisplay();
    const [source] = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(size.width * scaleFactor),
        height: Math.round(size.height * scaleFactor),
      },
    });
    return source.thumbnail.toPNG().toString("base64");
  });
  writeFileSync(file, Buffer.from(base64, "base64"));
  return file;
}

/** Frame statistics for the end-to-end gate: gaps between frames of each run of
 * one animated surface, and any jump of the box between frames. */
export function frameStats(frames, surface) {
  const mine = frames
    .filter((f) => f.surface === surface)
    .sort((a, b) => a.t - b.t);
  const gaps = [];
  let jumps = 0;
  for (let i = 1; i < mine.length; i++) {
    const gap = mine[i].t - mine[i - 1].t;
    // A new run starts after a pause that is not a dropped frame.
    if (gap > 250) continue;
    gaps.push(gap);
    const a = mine[i - 1].box,
      b = mine[i].box;
    if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 160) jumps++;
  }
  gaps.sort((p, q) => p - q);
  return {
    surface,
    frames: mine.length,
    p95: gaps[Math.floor(gaps.length * 0.95)] ?? 0,
    max: gaps[gaps.length - 1] ?? 0,
    jumps,
  };
}
