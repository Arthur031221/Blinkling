/** Global key and wheel state, the one thing Electron cannot give a background
 * app (M4). uiohook-napi taps the OS input stream on every platform: XRecord on
 * X11, CGEventTap on macOS (needs the Input Monitoring permission), low-level
 * hooks on Windows. It only listens; nothing is blocked or injected. */

// uiohook key codes, left and right variants.
const CONTROL = new Set([29, 3613]);
const OPTION = new Set([56, 3640]);
const SHIFT = new Set([42, 54]);
const ESCAPE = 1;

export function normalizeKey(code) {
  const key = CONTROL.has(code)
    ? "control"
    : OPTION.has(code)
      ? "option"
      : SHIFT.has(code)
        ? "shift"
        : code === ESCAPE
          ? "escape"
          : "other";
  return { key, code };
}

const defaultLoad = async () => (await import("uiohook-napi")).uIOhook;

export async function createKeySource({ load = defaultLoad } = {}) {
  let hook;
  try {
    hook = await load();
  } catch (error) {
    return {
      available: false,
      reason: String(error?.message ?? error),
      subscribe: () => () => {},
    };
  }
  const listeners = new Set();
  const emit = (event) => {
    for (const listener of [...listeners]) listener(event);
  };
  const forward = {
    keydown: (e) => emit({ type: "keydown", ...normalizeKey(e.keycode) }),
    keyup: (e) => emit({ type: "keyup", ...normalizeKey(e.keycode) }),
    wheel: () => emit({ type: "wheel" }),
    mousemove: (e) => emit({ type: "mousemove", x: e.x, y: e.y }),
    mousedown: (e) => emit({ type: "mousedown", x: e.x, y: e.y }),
    mouseup: (e) => emit({ type: "mouseup", x: e.x, y: e.y }),
  };
  const attach = () => {
    for (const [name, fn] of Object.entries(forward)) hook.on(name, fn);
    hook.start();
  };
  const detach = () => {
    for (const [name, fn] of Object.entries(forward))
      hook.removeListener(name, fn);
    hook.stop();
  };
  return {
    available: true,
    subscribe(listener) {
      if (!listeners.size) attach();
      listeners.add(listener);
      return () => {
        if (!listeners.delete(listener)) return;
        if (!listeners.size) detach();
      };
    },
  };
}
