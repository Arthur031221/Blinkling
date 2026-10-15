/* global Application */
// Accessibility helper for the Blinkling element locator (macOS), run with
//   osascript -l JavaScript ax.js '<json>'
// where <json> is {"cmd": "tree"|"focus"|"selection", "window": {app, title, pid, bounds}}.
// Prints one JSON document in the shape the Linux helper uses:
//   tree      -> {found, nodes: [{i, p, role, secure, name, text, bounds}]}
//   focus     -> {found, secure, app, title}
//   selection -> {found, text, bounds}
// Coordinates are points (screen DIP). Secure text fields are reported with
// "secure": true and never with a name or text.
const MAX_NODES = 300;
const MAX_DEPTH = 24;
const MAX_TEXT = 4000;

function safe(read, fallback) {
  try {
    const value = read();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function rectOf(element) {
  const position = safe(() => element.position(), null);
  const size = safe(() => element.size(), null);
  if (!position || !size) return null;
  return { x: position[0], y: position[1], width: size[0], height: size[1] };
}

function near(a, b, tolerance) {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

function findWindow(spec) {
  const events = Application("System Events");
  const processes = safe(
    () =>
      spec.pid
        ? events.processes.whose({ unixId: spec.pid })()
        : events.processes.whose({ name: spec.app })(),
    [],
  );
  for (const proc of processes) {
    const windows = safe(() => proc.windows(), []);
    let best = null;
    let bestScore = 0;
    for (const win of windows) {
      let score = 0;
      const rect = rectOf(win);
      if (rect && spec.bounds && near(rect, spec.bounds, 12)) score += 4;
      if (spec.title && safe(() => win.title(), "") === spec.title) score += 2;
      if (score > bestScore) {
        best = win;
        bestScore = score;
      }
    }
    if (best && bestScore >= 3) return { proc, win: best };
  }
  return null;
}

function isSecure(element) {
  return safe(() => element.subrole(), "") === "AXSecureTextField";
}

function describe(element, index, parent) {
  const secure = isSecure(element);
  const text = secure ? "" : String(safe(() => element.value(), "") || "");
  return {
    i: index,
    p: parent,
    role: safe(() => element.role(), ""),
    secure,
    name: secure
      ? ""
      : String(safe(() => element.title() || element.description(), "") || ""),
    text: typeof text === "string" ? text.slice(0, MAX_TEXT) : "",
    bounds: rectOf(element),
  };
}

function tree(spec) {
  const found = findWindow(spec);
  if (!found) return { found: false, nodes: [] };
  const nodes = [];
  const walk = (element, parent, depth) => {
    if (nodes.length >= MAX_NODES || depth > MAX_DEPTH) return;
    const node = describe(element, nodes.length, parent);
    if (!node.bounds) return;
    nodes.push(node);
    const children = safe(() => element.uiElements(), []);
    for (const child of children) walk(child, node.i, depth + 1);
  };
  walk(found.win, -1, 0);
  return { found: true, nodes };
}

function focus() {
  const events = Application("System Events");
  const front = safe(
    () => events.processes.whose({ frontmost: true })()[0],
    null,
  );
  if (!front) return { found: false };
  const focused = safe(
    () => front.attributes.byName("AXFocusedUIElement").value(),
    null,
  );
  return {
    found: true,
    secure: focused ? isSecure(focused) : false,
    app: safe(() => front.name(), ""),
    title: safe(() => front.windows[0].title(), ""),
  };
}

function selection(spec) {
  const found = findWindow(spec);
  if (!found) return { found: false };
  const focused = safe(
    () => found.proc.attributes.byName("AXFocusedUIElement").value(),
    null,
  );
  if (!focused || isSecure(focused)) return { found: false };
  const text = String(
    safe(() => focused.attributes.byName("AXSelectedText").value(), "") || "",
  );
  const bounds = rectOf(focused);
  if (!text || !bounds) return { found: false };
  return { found: true, text: text.slice(0, MAX_TEXT), bounds };
}

// osascript calls run(argv) itself.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function run(argv) {
  let request;
  try {
    request = JSON.parse(argv[0]);
  } catch {
    return JSON.stringify({ found: false });
  }
  const handlers = { tree, focus, selection };
  const handler = handlers[request.cmd];
  if (!handler) return JSON.stringify({ found: false });
  return JSON.stringify(handler(request.window || {}));
}
