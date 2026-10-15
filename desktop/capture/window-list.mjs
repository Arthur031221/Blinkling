/** The windows on screen, front to back, for the capture overlay's window
 * pick. Every source only reads window facts: geometry, owner, title, layer.
 * Our own windows are left out, and any failure is an empty list, because a
 * capture without window highlights is still a capture. */
import { execFile } from "node:child_process";
import x11 from "x11";

const MIN_SIDE = 40;
const MAX_WINDOWS = 64;
const DEFAULT_TIMEOUT = 1500;
const SKIPPED_TYPES = new Set([
  "_NET_WM_WINDOW_TYPE_DESKTOP",
  "_NET_WM_WINDOW_TYPE_DOCK",
  "_NET_WM_WINDOW_TYPE_MENU",
  "_NET_WM_WINDOW_TYPE_POPUP_MENU",
  "_NET_WM_WINDOW_TYPE_DROPDOWN_MENU",
  "_NET_WM_WINDOW_TYPE_TOOLTIP",
  "_NET_WM_WINDOW_TYPE_NOTIFICATION",
  "_NET_WM_WINDOW_TYPE_COMBO",
  "_NET_WM_WINDOW_TYPE_DND",
  "_NET_WM_WINDOW_TYPE_SPLASH",
]);

const optional = async (read) => {
  try {
    return await read();
  } catch {
    return null;
  }
};
const classOf = (raw) => {
  const parts = String(raw ?? "")
    .split("\0")
    .filter(Boolean);
  return parts[1] ?? parts[0] ?? "";
};

/** The client window inside a frame: the frame itself on a window manager that
 * does not reparent, otherwise the first descendant that has a WM_CLASS. */
async function clientOf(api, id, depth = 3) {
  if (await optional(() => api.property(id, "WM_CLASS"))) return id;
  if (depth === 0) return null;
  const children = (await optional(() => api.children(id))) ?? [];
  for (const child of children) {
    const found = await clientOf(api, child, depth - 1);
    if (found !== null) return found;
  }
  return null;
}

/** `api` is the thin X11 reader below (or a fake in tests); `own.ids` are the
 * native ids of our own windows, frames or clients. */
export async function collectX11(api, own = {}) {
  const ours = own.ids ?? new Set();
  const pids = own.pids ?? new Set();
  const frames = await api.children("root");
  const found = [];
  for (const frame of [...frames].reverse()) {
    try {
      const attributes = await api.attributes(frame);
      if (!attributes.viewable || attributes.overrideRedirect) continue;
      const client = await clientOf(api, frame);
      if (client === null || ours.has(frame) || ours.has(client)) continue;
      const types =
        (await optional(() => api.property(frame, "_NET_WM_WINDOW_TYPE"))) ??
        (await optional(() => api.property(client, "_NET_WM_WINDOW_TYPE"))) ??
        [];
      if (types.some((type) => SKIPPED_TYPES.has(type))) continue;
      const bounds = await api.geometry(frame);
      const appClass = classOf(await api.property(client, "WM_CLASS"));
      const title =
        (await optional(() => api.property(client, "_NET_WM_NAME"))) ??
        (await optional(() => api.property(client, "WM_NAME"))) ??
        "";
      const pid = await optional(() => api.property(client, "_NET_WM_PID"));
      if (pids.has(pid)) continue;
      found.push({
        id: frame,
        app: appClass,
        appClass,
        title,
        pid: pid ?? undefined,
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      });
    } catch {
      // The window went away while it was read.
    }
  }
  return found;
}

/** The real reader, over the x11 package. Resolves with `close`. */
export function openX11() {
  return new Promise((resolve, reject) => {
    const client = x11.createClient((error, display) => {
      if (error) {
        reject(error);
        return;
      }
      const root = display.screen[0].root;
      const ask = (call) =>
        new Promise((done, fail) =>
          call((err, value) => (err ? fail(err) : done(value))),
        );
      const atoms = new Map();
      const atom = async (name) => {
        if (!atoms.has(name))
          atoms.set(
            name,
            await ask((cb) => client.InternAtom(false, name, cb)),
          );
        return atoms.get(name);
      };
      const atomName = (value) => ask((cb) => client.GetAtomName(value, cb));
      const raw = async (id, name) => {
        const reply = await ask(async (cb) =>
          client.GetProperty(0, id, await atom(name), 0, 0, 1024, cb),
        );
        return reply?.data?.length ? reply.data : null;
      };
      const api = {
        children: async (id) =>
          (await ask((cb) => client.QueryTree(id === "root" ? root : id, cb)))
            .children,
        attributes: async (id) => {
          const attributes = await ask((cb) =>
            client.GetWindowAttributes(id, cb),
          );
          return {
            viewable: attributes.mapState === 2,
            overrideRedirect: !!attributes.overrideRedirect,
          };
        },
        geometry: async (id) => {
          const g = await ask((cb) => client.GetGeometry(id, cb));
          return { x: g.xPos, y: g.yPos, width: g.width, height: g.height };
        },
        property: async (id, name) => {
          const data = await raw(id, name);
          if (!data) return null;
          if (name === "_NET_WM_PID") return data.readUInt32LE(0);
          if (name === "_NET_WM_WINDOW_TYPE") {
            const types = [];
            for (let at = 0; at + 4 <= data.length; at += 4)
              types.push(await atomName(data.readUInt32LE(at)));
            return types;
          }
          return data.toString(name === "WM_NAME" ? "latin1" : "utf8");
        },
        close: () => client.terminate(),
      };
      resolve(api);
    });
    client.on("error", reject);
  });
}

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const box = (x, y, width, height) => ({
  x: number(x),
  y: number(y),
  width: number(width),
  height: number(height),
});
const parseJsonList = (text) => {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** macOS: CGWindowListCopyWindowInfo, on-screen windows, front to back. */
export const MAC_SCRIPT = `
ObjC.import("CoreGraphics");
const info = ObjC.deepUnwrap(
  ObjC.castRefToObject($.CGWindowListCopyWindowInfo(17, 0)),
);
JSON.stringify(
  info.map((w) => ({
    id: w.kCGWindowNumber,
    pid: w.kCGWindowOwnerPID,
    owner: w.kCGWindowOwnerName,
    name: w.kCGWindowName,
    layer: w.kCGWindowLayer,
    alpha: w.kCGWindowAlpha,
    bounds: w.kCGWindowBounds,
  })),
);
`;

export function parseMacWindows(text, own = {}) {
  const pids = own.pids ?? new Set();
  return parseJsonList(text)
    .filter(
      (w) =>
        w &&
        w.layer === 0 &&
        number(w.alpha) > 0 &&
        !pids.has(w.pid) &&
        number(w.bounds?.Width) > 0 &&
        number(w.bounds?.Height) > 0,
    )
    .map((w) => ({
      id: String(w.id),
      pid: w.pid,
      app: String(w.owner ?? ""),
      title: String(w.name ?? ""),
      bounds: box(w.bounds.X, w.bounds.Y, w.bounds.Width, w.bounds.Height),
    }));
}

/** Windows: EnumWindows walks top to bottom. Hidden, cloaked, tool and
 * untitled windows are not offered. */
export const WINDOWS_SCRIPT = `
Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Diagnostics;
using System.Runtime.InteropServices; using System.Text;
public static class BlinklingWindows {
  delegate bool Walk(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Walk f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT v, int n);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  static string Quote(string s) { return "\\"" + s.Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\"") + "\\""; }
  public static string List() {
    var rows = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);
      if (cloaked != 0 || (GetWindowLong(h, -20) & 0x80) != 0) return true;
      var title = new StringBuilder(256); GetWindowText(h, title, 256);
      if (title.Length == 0) return true;
      RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      string app = ""; try { app = Process.GetProcessById((int)pid).ProcessName; } catch { }
      rows.Add("{\\"id\\":" + h.ToInt64() + ",\\"pid\\":" + pid + ",\\"app\\":" + Quote(app) + ",\\"title\\":" + Quote(title.ToString()) + ",\\"x\\":" + r.L + ",\\"y\\":" + r.T + ",\\"width\\":" + (r.R - r.L) + ",\\"height\\":" + (r.B - r.T) + "}");
      return true;
    }, IntPtr.Zero);
    return "[" + string.Join(",", rows) + "]";
  }
}
"@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[BlinklingWindows]::List()
`;

export function parseWindowsWindows(text, own = {}) {
  const pids = own.pids ?? new Set();
  return parseJsonList(text)
    .filter(
      (w) =>
        w && !pids.has(w.pid) && number(w.width) > 0 && number(w.height) > 0,
    )
    .map((w) => ({
      id: String(w.id),
      pid: w.pid,
      app: String(w.app ?? ""),
      title: String(w.title ?? ""),
      bounds: box(w.x, w.y, w.width, w.height),
    }));
}

/** Native boxes to display-relative DIP boxes clipped to the display; `toDip`
 * maps a native screen point to a DIP screen point. Slivers are dropped. */
export function fitWindows(windows, display, toDip) {
  const area = display.bounds;
  const fitted = [];
  for (const win of windows) {
    const { x, y, width, height } = win.bounds;
    const from = toDip({ x, y });
    const to = toDip({ x: x + width, y: y + height });
    const left = Math.max(from.x, area.x);
    const top = Math.max(from.y, area.y);
    const right = Math.min(to.x, area.x + area.width);
    const bottom = Math.min(to.y, area.y + area.height);
    if (right - left < MIN_SIDE || bottom - top < MIN_SIDE) continue;
    fitted.push({
      ...win,
      bounds: {
        x: Math.round(left - area.x),
        y: Math.round(top - area.y),
        width: Math.round(right - left),
        height: Math.round(bottom - top),
      },
    });
    if (fitted.length === MAX_WINDOWS) break;
  }
  return fitted;
}

export const execText = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

/** Native-pixel windows, front to back, for this platform. Never throws. */
export async function listWindows({
  platform = process.platform,
  run = execText,
  own = {},
  api,
  timeout = DEFAULT_TIMEOUT,
} = {}) {
  let timer;
  const giveUp = new Promise((resolve) => {
    timer = setTimeout(() => resolve([]), timeout);
  });
  const read = async () => {
    if (platform === "darwin")
      return parseMacWindows(
        await run("osascript", ["-l", "JavaScript", "-e", MAC_SCRIPT]),
        own,
      );
    if (platform === "win32")
      return parseWindowsWindows(
        await run("powershell", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          WINDOWS_SCRIPT,
        ]),
        own,
      );
    if (platform === "linux" && (api || process.env.DISPLAY)) {
      const reader = api ?? (await openX11());
      try {
        return await collectX11(reader, own);
      } finally {
        if (!api) reader.close?.();
      }
    }
    return [];
  };
  try {
    return await Promise.race([read().catch(() => []), giveUp]);
  } finally {
    clearTimeout(timer);
  }
}
