// What the three operating-system accessibility sources share: turning the
// flat node lists their helpers print into raw elements in screen DIP.
import { kindOfAx } from "../kinds.mjs";

const contains = (a, b) =>
  a.x <= b.x &&
  a.y <= b.y &&
  a.x + a.width >= b.x + b.width &&
  a.y + a.height >= b.y + b.height;

// Scale of the display whose DIP area holds the native-pixel rect's centre.
export function scaleAt(displays, px) {
  const list = displays ?? [];
  const cx = px.x + px.width / 2;
  const cy = px.y + px.height / 2;
  for (const d of list) {
    const s = d.scaleFactor || 1;
    const x = cx / s;
    const y = cy / s;
    const b = d.bounds;
    if (x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height)
      return s;
  }
  return list[0]?.scaleFactor || 1;
}

export const toDipRect = (px, displays, native) => {
  const s = native ? scaleAt(displays, px) : 1;
  return {
    x: px.x / s,
    y: px.y / s,
    width: px.width / s,
    height: px.height / s,
  };
};

// Lists without parent links (macOS, Windows): the parent is the smallest
// earlier node that contains the node.
export function inferParents(nodes) {
  nodes.forEach((n, i) => {
    if (n.p !== undefined && n.p !== null) return;
    let best = -1;
    for (let j = 0; j < i; j++) {
      const c = nodes[j];
      if (
        contains(c.bounds, n.bounds) &&
        (best < 0 ||
          c.bounds.width * c.bounds.height <=
            nodes[best].bounds.width * nodes[best].bounds.height)
      )
        best = j;
    }
    n.p = best;
  });
  return nodes;
}

// nodes: [{ i, p, role, secure, name, text, bounds }] -> Raw[]
export function nodesToRaw(nodes, { displays, native }) {
  const raw = [];
  const secure = new Set();
  for (const n of nodes ?? []) {
    if (n?.secure === true || /password/i.test(n?.role ?? "")) {
      secure.add(String(n.i));
      continue;
    }
    const b = n?.bounds;
    if (
      !b ||
      ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
      b.width <= 0 ||
      b.height <= 0
    )
      continue;
    raw.push({
      key: String(n.i),
      parent: n.p == null || n.p < 0 ? null : String(n.p),
      kind: kindOfAx(n.role),
      bounds: toDipRect(b, displays, native),
      role: String(n.role ?? ""),
      name: String(n.name ?? ""),
      text: String(n.text ?? ""),
      secure: false,
    });
  }
  // A node whose parent was a secure field hangs from nothing.
  return clipToAncestors(
    raw.map((r) =>
      r.parent && secure.has(r.parent) ? { ...r, parent: null } : r,
    ),
  );
}

// A viewer reports the whole of a scrolled page, not the part on screen.
// What is shown of an element is what its ancestors show of it; one that is
// scrolled out of every ancestor is not there to be pointed at.
function clipToAncestors(raw) {
  const byKey = new Map(raw.map((r) => [r.key, r]));
  const clipped = new Map();
  const visit = (r, seen = new Set()) => {
    if (clipped.has(r.key)) return clipped.get(r.key);
    seen.add(r.key);
    const above = r.parent && !seen.has(r.parent) ? byKey.get(r.parent) : null;
    let rect = r.bounds;
    if (above) {
      const outer = visit(above, seen);
      rect = outer && intersect(rect, outer);
    }
    clipped.set(r.key, rect);
    return rect;
  };
  const kept = new Set();
  for (const r of raw) if (visit(r)) kept.add(r.key);
  return raw
    .filter((r) => kept.has(r.key))
    .map((r) => ({ ...r, bounds: clipped.get(r.key) }));
}

function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}

// Native-pixel rect of a DIP window, for helpers that match by geometry.
export function windowQuery(win, displays, native) {
  const scale = native ? displayScale(displays, win.bounds) : 1;
  return {
    app: win.app,
    title: win.title,
    pid: win.pid,
    bounds: {
      x: win.bounds.x * scale,
      y: win.bounds.y * scale,
      width: win.bounds.width * scale,
      height: win.bounds.height * scale,
    },
  };
}

function displayScale(displays, dip) {
  const cx = dip.x + dip.width / 2;
  const cy = dip.y + dip.height / 2;
  const hit = (displays ?? []).find(
    (d) =>
      cx >= d.bounds.x &&
      cy >= d.bounds.y &&
      cx < d.bounds.x + d.bounds.width &&
      cy < d.bounds.y + d.bounds.height,
  );
  return (hit ?? displays?.[0])?.scaleFactor || 1;
}

// Shared body of the three sources: a `request(cmd, payload)` that talks to the
// platform helper and answers plain objects.
export function createHelperSource({ request, displays, native, name = "ax" }) {
  const displaysOf = (ctx) => ctx?.displays ?? displays?.() ?? [];
  return {
    name,
    applies: () => true,
    warm: () => request.warm?.(),
    async load(win, ctx = {}) {
      const list = displaysOf(ctx);
      try {
        const result = await request("tree", windowQuery(win, list, native));
        if (!result?.found || !Array.isArray(result.nodes)) return null;
        const nodes = inferParents(result.nodes.map((n) => ({ ...n })));
        const elements = nodesToRaw(nodes, { displays: list, native });
        return elements.length ? { elements } : null;
      } catch {
        return null;
      }
    },
    async focus() {
      try {
        const result = await request("focus", {});
        if (!result?.found) return null;
        return {
          secure: result.secure === true,
          app: result.app ?? "",
          title: result.title ?? "",
        };
      } catch {
        return null;
      }
    },
    async selection(win, ctx = {}) {
      const list = displaysOf(ctx);
      try {
        const result = await request(
          "selection",
          windowQuery(win, list, native),
        );
        if (!result?.found || !result.text) return null;
        return {
          text: String(result.text),
          bounds: toDipRect(result.bounds, list, native),
        };
      } catch {
        return null;
      }
    },
    close: request?.close,
  };
}
