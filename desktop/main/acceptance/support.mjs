import { _electron as electron, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "../e2e/exec.mjs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
export const report =
  process.env.BLINKLING_REPORT_DIR ?? join(tmpdir(), "blinkling-shell-report");
export async function launch({
  scale = 1,
  theme = "light",
  data,
  env = {},
} = {}) {
  await mkdir(report, { recursive: true });
  const userData = data ?? (await mkdtemp(join(tmpdir(), "blink-e2e-")));
  // The first fan shows its labels once; these suites measure the bare fan.
  const once = join(userData, "ui-once.json");
  const seen = await readFile(once, "utf8").catch(() => "{}");
  await writeFile(
    once,
    JSON.stringify({ ...JSON.parse(seen), "fan-labels": true }),
  );
  const app = await electron.launch({
    args: [
      resolve(fileURLToPath(new URL("../..", import.meta.url))),
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--force-device-scale-factor=${scale}`,
      "--lang=zh-TW",
    ],
    env: {
      ...process.env,
      BLINKLING_E2E: "1",
      BLINKLING_REMOTE: "0",
      BLINKLING_TEST_DATA: userData,
      ...env,
    },
  });
  await app.evaluate(({ nativeTheme }, theme) => {
    nativeTheme.themeSource = theme;
  }, theme);
  const page = await app.firstWindow();
  page.on("pageerror", (error) => process.stderr.write(`${error.stack}\n`));
  await page.waitForFunction(() => window.desktop);
  await expect
    .poll(() => app.evaluate(() => !!globalThis.blinklingTest?.features))
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
            : `t.XTestFakeButtonEvent(d,1,${e.type === "down" ? 1 : 0},0);x.XFlush(d);time.sleep(${e.wait ?? 0.08})`;
/** Plays the events through XTest. With `stamp` it returns, for every move,
 * press and release, the wall clock in ms at which that event reached the X
 * server, so a test can time how long the app took to answer it. */
export function native(events, { stamp = false } = {}) {
  const out = execFileSync("python3", [
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
 ${events
   .map(python)
   .map((line) =>
     stamp && /^t\.XTestFake(Motion|Button)/.test(line)
       ? line.replace(
           ";time.sleep(",
           ";print(int(time.time()*1000),flush=True);time.sleep(",
         )
       : line,
   )
   .join("\n ")}
finally:x.XCloseDisplay(d)`,
  ]);
  return String(out).split("\n").filter(Boolean).map(Number);
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
/** Where Blink's body is drawn, in page pixels. An SVG shape has no CSS box,
 * so the page measures it instead of asking Playwright. */
export const bodyBox = (page) =>
  page.evaluate(() => {
    const { x, y, width, height } = document
      .querySelector(".blink-body")
      .getBoundingClientRect();
    return { x, y, width, height };
  });
/** A spot on Blink's body that is really drawn (not behind a screen edge), in
 * page pixels: where a pointer goes to touch Blink. */
export const bodyPoint = (page) =>
  page.evaluate(() => {
    const body = document.querySelector(".blink-body");
    const r = body.getBoundingClientRect();
    const shows = (x, y) =>
      x > 2 &&
      y > 2 &&
      x < innerWidth - 2 &&
      y < innerHeight - 2 &&
      document.elementsFromPoint(x, y).includes(body);
    let best = null;
    const want = { x: r.x + r.width * 0.3, y: r.y + r.height * 0.72 };
    for (let i = 0; i <= 16; i++)
      for (let j = 0; j <= 16; j++) {
        const x = r.x + (r.width * i) / 16,
          y = r.y + (r.height * j) / 16;
        if (!shows(x, y)) continue;
        const d = Math.hypot(x - want.x, y - want.y);
        if (!best || d < best.d) best = { x, y, d };
      }
    return best && { x: best.x, y: best.y };
  });
/** The far end of the limb that sticks out of Blink the most, in page pixels. */
export const limbTip = (page) =>
  page.evaluate(() => {
    const polys = window.desktop.character.polygons();
    const [body, ...limbs] = polys;
    const c = body.reduce(
      (m, p) => ({ x: m.x + p.x / body.length, y: m.y + p.y / body.length }),
      { x: 0, y: 0 },
    );
    let tip = null;
    for (const poly of limbs) {
      const mid = poly.reduce(
        (m, p) => ({ x: m.x + p.x / poly.length, y: m.y + p.y / poly.length }),
        { x: 0, y: 0 },
      );
      for (const p of poly) {
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (!tip || d > tip.d) tip = { x: p.x, y: p.y, d, mid };
      }
    }
    // A few pixels inside the outline, so the click lands on the limb itself.
    const k = 6 / (Math.hypot(tip.mid.x - tip.x, tip.mid.y - tip.y) || 1);
    return {
      x: tip.x + (tip.mid.x - tip.x) * k,
      y: tip.y + (tip.mid.y - tip.y) * k,
    };
  });
