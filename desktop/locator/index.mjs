// The element locator (M1, M2): what is under the pointer, as a typed element
// with exact bounds. Sources are tried in order, the page structure the browser
// helper exports, the operating system's accessibility tree, then local image
// analysis. Lists are cached per window so a hover answers from memory.
import { windowAt as hitWindow } from "../capture/window-hit.mjs";
import { classify } from "../privacy/rules.mjs";
import { createCache } from "./cache.mjs";
import { isKind } from "./kinds.mjs";
import { displayAt, snapRect } from "./snap.mjs";
import { createAxSource } from "./sources/ax-common.mjs";
import { createDomSource } from "./sources/dom.mjs";
import { createImageSource } from "./sources/image.mjs";

export const TEXT_CAP = 4000;
// A hover has 50 ms; the rest is the caller's. A source gets at most SOURCE_WAIT.
export const HOVER_BUDGET_MS = 46;
export const SOURCE_WAIT_MS = 40;
const SNAP_WAIT_MS = 400;
const ELEMENTS_WAIT_MS = 2000;
const FOCUS_WAIT_MS = 1500;
const WINDOWS_MAX_AGE_MS = 200;
// Used to place a sentence inside a paragraph; a rendered line is about this tall.
const LINE_HEIGHT = 22;

const finiteRect = (b) =>
  !!b && ["x", "y", "width", "height"].every((k) => Number.isFinite(b[k]));
const finitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const contains = (b, p) =>
  p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;
const area = (b) => b.width * b.height;
const intersection = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const cap = (text) => String(text ?? "").slice(0, TEXT_CAP);

// "dom:w1:12" -> { source: "dom", windowId: "w1", n: "12" }. A window id may
// itself hold colons, so the source is up to the first and the number from the last.
function parseId(id) {
  const text = String(id ?? "").replace(/#s\d+$/, "");
  const first = text.indexOf(":");
  const last = text.lastIndexOf(":");
  if (first < 0 || last <= first) return null;
  return {
    base: text,
    source: text.slice(0, first),
    windowId: text.slice(first + 1, last),
  };
}

const rowsOf = (bounds) => Math.max(1, Math.round(bounds.height / LINE_HEIGHT));

let segmenter;
function sentencesOf(text) {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "sentence" });
  const out = [];
  for (const part of segmenter.segment(text)) {
    const trimmed = part.segment.trim();
    if (!trimmed) continue;
    const lead = part.segment.length - part.segment.trimStart().length;
    out.push({
      text: trimmed,
      start: part.index + lead,
      end: part.index + lead + trimmed.length,
    });
  }
  return out;
}

/** createLocator({ companion, platform, capture, host?, ax?, image?, now? })
 * capture = { windows(): Promise<WindowRef[]>, displays(): DisplayRef[],
 *             image?(rect) }, windows front to back in absolute DIP.
 * ax / image may be passed as sources (or null to switch one off). */
export function createLocator({
  companion,
  platform = process.platform,
  capture,
  host,
  ax,
  image,
  now = Date.now,
} = {}) {
  const displays = () => {
    try {
      return capture?.displays?.() ?? [];
    } catch {
      return [];
    }
  };
  const sources = [
    createDomSource({ host, companion }),
    ax === undefined ? createAxSource({ platform, displays }) : ax,
    image === undefined ? createImageSource({ capture }) : image,
  ].filter(Boolean);

  const cache = createCache({ now });
  const privateIds = new Set(); // windows whose page reported a private tab
  const abort = new AbortController();
  let closed = false;
  let listed = null; // { at, raws, pending }

  // --- windows -------------------------------------------------------------
  async function rawWindows(maxAge = 0) {
    const t = performance.now();
    if (listed?.pending && maxAge > 0) return listed.pending;
    if (listed && !listed.pending && maxAge > 0 && t - listed.at < maxAge)
      return listed.raws;
    const pending = (async () => {
      let raws = [];
      try {
        const got = await capture?.windows?.();
        raws = Array.isArray(got)
          ? got.filter((w) => w && finiteRect(w.bounds))
          : [];
      } catch {
        raws = [];
      }
      listed = { at: performance.now(), raws };
      forget(raws);
      return raws;
    })();
    listed = { at: t, raws: listed?.raws ?? [], pending };
    return pending;
  }

  // Windows that are gone take their cached lists and flags with them.
  function forget(raws) {
    const ids = new Set(raws.map((w) => String(w.id)));
    const keep = new Set();
    for (const id of ids) for (const s of sources) keep.add(`${s.name}:${id}`);
    cache.prune(keep);
    for (const id of privateIds) if (!ids.has(id)) privateIds.delete(id);
  }

  function refOf(raw) {
    const reason = classify({ window: raw }).reason;
    return {
      id: raw.id,
      title: String(raw.title ?? ""),
      app: String(raw.app ?? ""),
      bounds: { ...raw.bounds },
      private: reason === "private" || privateIds.has(String(raw.id)),
      passwordManager: reason === "password-manager",
    };
  }
  const blocked = (raw) => {
    const ref = refOf(raw);
    return ref.private || ref.passwordManager;
  };

  // The window a rect belongs to: the one under its centre, else the most covered.
  function windowFor(raws, rect) {
    const c = centre(rect);
    const under = hitWindow(raws, c);
    if (under) return under;
    let best = null;
    let most = 0;
    for (const w of raws) {
      const shared = intersection(rect, w.bounds);
      if (shared > most) {
        best = w;
        most = shared;
      }
    }
    return best;
  }

  // --- sources -------------------------------------------------------------
  const keyOf = (source, win) => `${source.name}:${win.id}`;
  const signatureOf = (win) =>
    `${win.bounds.x},${win.bounds.y},${win.bounds.width},${win.bounds.height}|${win.title ?? ""}`;

  function build(source, win, result) {
    const ref = refOf(win);
    const list = displays();
    const items = (result.elements ?? []).filter(
      (r) => r && r.secure !== true && isKind(r.kind) && finiteRect(r.bounds),
    );
    const byKey = new Map();
    const elements = [];
    const parents = new Map();
    const byId = new Map();
    const droppedParent = new Map();
    for (const r of result.elements ?? [])
      droppedParent.set(r.key, r.parent ?? null);
    items.forEach((r, n) => {
      const id = `${source.name}:${win.id}:${n}`;
      byKey.set(r.key, id);
      const display = displayAt(list, centre(r.bounds)) ?? list[0] ?? null;
      const element = {
        id,
        kind: r.kind,
        bounds: { ...r.bounds },
        role: String(r.role ?? ""),
        name: cap(r.name),
        text: cap(r.text),
        window: ref,
        display,
        ...(r.content ? { content: r.content } : {}),
      };
      elements.push(element);
      byId.set(id, element);
    });
    // A parent that was dropped (secure) passes the link up to its own parent.
    const idOfKey = (key) => {
      let k = key;
      for (let hops = 0; k != null && hops < 64; hops++) {
        if (byKey.has(k)) return byKey.get(k);
        k = droppedParent.get(k) ?? null;
      }
      return null;
    };
    items.forEach((r) =>
      parents.set(byKey.get(r.key), idOfKey(r.parent ?? null)),
    );
    return { elements, parents, byId, private: result.private === true };
  }

  async function applies(source, win) {
    try {
      return source.applies ? (await source.applies(win)) !== false : true;
    } catch {
      return false;
    }
  }

  // -> the built list for one source and window, or null (not applicable, still
  // loading past `wait`, or failed). A private page marks its window.
  async function listFrom(source, win, { wait, point }) {
    if (!(await applies(source, win))) return null;
    const result = await cache.fetch(
      keyOf(source, win),
      signatureOf(win),
      async () => {
        const got = await source.load(win, {
          point,
          displays: displays(),
          signal: abort.signal,
        });
        if (!got || !Array.isArray(got.elements)) return null;
        const built = build(source, win, got);
        if (built.private) privateIds.add(String(win.id));
        return built;
      },
      { wait },
    );
    return result.status === "pending" ? null : (result.value ?? null);
  }

  const copy = (element) => ({ ...element, bounds: { ...element.bounds } });

  function smallestAt(list, point) {
    let best = null;
    for (const element of list.elements) {
      if (!contains(element.bounds, point)) continue;
      if (!best || area(element.bounds) <= area(best.bounds)) best = element;
    }
    return best;
  }

  // --- API -----------------------------------------------------------------
  async function locateWithin(point, deadline) {
    const raws = await rawWindows(WINDOWS_MAX_AGE_MS);
    const win = hitWindow(raws, point);
    if (!win || blocked(win)) return null;
    for (const source of sources) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) return null;
      const list = await listFrom(source, win, {
        wait: Math.min(SOURCE_WAIT_MS, remaining),
        point,
      });
      if (!list) continue;
      if (list.private || privateIds.has(String(win.id))) return null;
      const hit = smallestAt(list, point);
      if (hit) return copy(hit);
    }
    return null;
  }

  async function elementsOf(win, wait) {
    if (blocked(win)) return [];
    for (const source of sources) {
      const list = await listFrom(source, win, { wait });
      if (!list) continue;
      if (list.private || privateIds.has(String(win.id))) return [];
      if (list.elements.length) return list.elements;
    }
    return [];
  }

  const api = {
    /** The smallest element under the point, or null. Answers within the hover
     * budget; a source that is still loading is skipped and warms the cache. */
    async locate(point) {
      if (closed || !finitePoint(point)) return null;
      const deadline = performance.now() + HOVER_BUDGET_MS;
      let timer;
      try {
        return await Promise.race([
          locateWithin(point, deadline).catch(() => null),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), HOVER_BUDGET_MS);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },

    async elements(window) {
      if (closed || !window?.bounds) return [];
      try {
        const raws = await rawWindows();
        const win =
          raws.find((w) => String(w.id) === String(window.id)) ?? window;
        return (await elementsOf(win, ELEMENTS_WAIT_MS)).map(copy);
      } catch {
        return [];
      }
    },

    async parent(element) {
      try {
        const id = parseId(element?.id);
        if (!id) return null;
        const list = cache.peek(`${id.source}:${id.windowId}`)?.value;
        // A sentence sits inside the element it was cut from.
        if (/#s\d+$/.test(String(element.id))) {
          const whole = list?.byId.get(id.base);
          return whole ? copy(whole) : null;
        }
        const parentId = list?.parents?.get(id.base);
        const parent = parentId ? list.byId.get(parentId) : null;
        return parent ? copy(parent) : null;
      } catch {
        return null;
      }
    },

    /** The sentence of a text element under the point. Where a sentence sits in
     * the paragraph is estimated from its characters spread over the rendered lines. */
    async sentenceAt(element, point) {
      const text = String(element?.text ?? "");
      if (!finiteRect(element?.bounds) || !text.trim()) return null;
      const parts = sentencesOf(text);
      if (!parts.length) return null;
      const b = element.bounds;
      const make = (i, bounds) => ({
        ...element,
        id: `${element.id}#s${i}`,
        kind: "sentence",
        text: parts[i].text,
        bounds,
      });
      if (parts.length === 1) return make(0, { ...b });
      const rows = rowsOf(b);
      const perRow = Math.max(1, Math.ceil(text.length / rows));
      let at = 0;
      if (finitePoint(point)) {
        const row = Math.min(
          rows - 1,
          Math.max(0, Math.floor(((point.y - b.y) / b.height) * rows)),
        );
        const col = Math.min(1, Math.max(0, (point.x - b.x) / b.width));
        at = Math.floor(row * perRow + col * perRow);
      }
      let index = parts.findIndex((p) => at < p.end);
      if (index < 0) index = parts.length - 1;
      const { start, end } = parts[index];
      const first = Math.min(rows - 1, Math.floor(start / perRow));
      const last = Math.min(
        rows - 1,
        Math.floor(Math.max(start, end - 1) / perRow),
      );
      const lineHeight = b.height / rows;
      const y = b.y + first * lineHeight;
      const height = (last - first + 1) * lineHeight;
      if (first === last) {
        const column = (offset) =>
          Math.min(1, Math.max(0, (offset - first * perRow) / perRow));
        const x0 = b.x + column(start) * b.width;
        const right = Math.max(x0 + 1, b.x + column(end) * b.width);
        return make(index, { x: x0, y, width: right - x0, height });
      }
      return make(index, { x: b.x, y, width: b.width, height });
    },

    /** The text the user has selected where the pointer is (accessibility only). */
    async selectionAt(point) {
      if (closed || !finitePoint(point)) return null;
      try {
        const raws = await rawWindows();
        const win = hitWindow(raws, point);
        if (!win || blocked(win)) return null;
        for (const source of sources) {
          if (typeof source.selection !== "function") continue;
          const found = await source.selection(win, { displays: displays() });
          if (!found?.text || !finiteRect(found.bounds)) continue;
          if (!contains(found.bounds, point)) continue;
          return {
            id: `${source.name}:${win.id}:selection`,
            kind: "text",
            bounds: { ...found.bounds },
            role: "",
            name: "",
            text: cap(found.text),
            window: refOf(win),
            display: displayAt(displays(), centre(found.bounds)) ?? null,
          };
        }
      } catch {
        // fall through: no selection is the safe answer
      }
      return null;
    },

    /** The text inside a rect, in reading order, 4000 characters at most. */
    async textIn(rect) {
      if (closed || !finiteRect(rect)) return "";
      try {
        const raws = await rawWindows();
        const win = windowFor(raws, rect);
        if (!win || blocked(win)) return "";
        for (const source of sources) {
          const list = await listFrom(source, win, { wait: ELEMENTS_WAIT_MS });
          if (!list) continue;
          if (list.private || privateIds.has(String(win.id))) return "";
          const inside = list.elements.filter(
            (e) => e.text.trim() && intersection(rect, e.bounds) > 0,
          );
          const ancestors = new Set();
          for (const e of inside) {
            for (
              let id = list.parents.get(e.id), hops = 0;
              id && hops < 64;
              hops++
            ) {
              ancestors.add(id);
              id = list.parents.get(id);
            }
          }
          const text = inside
            .filter((e) => !ancestors.has(e.id))
            .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
            .map((e) => e.text.trim())
            .join("\n");
          if (text) return text.slice(0, TEXT_CAP);
        }
      } catch {
        // an unreadable area has no text
      }
      return "";
    },

    /** The front window and whether a secure field has the keyboard focus. */
    async focus() {
      let win = null;
      try {
        win = (await rawWindows())[0] ?? null;
      } catch {
        win = null;
      }
      let secure = false;
      const reader = sources.find((s) => typeof s.focus === "function");
      if (reader && !closed) {
        let timer;
        try {
          const got = await Promise.race([
            reader.focus(),
            new Promise((resolve) => {
              timer = setTimeout(() => resolve(null), FOCUS_WAIT_MS);
            }),
          ]);
          secure = got?.secure === true;
        } catch {
          secure = false;
        } finally {
          clearTimeout(timer);
        }
      }
      return { secure, window: win ? refOf(win) : null };
    },

    async windowAt(point) {
      if (closed || !finitePoint(point)) return null;
      try {
        const win = hitWindow(await rawWindows(), point);
        return win ? refOf(win) : null;
      } catch {
        return null;
      }
    },

    /** Fits a marked rect to the element it covers, aligned to the device pixels
     * of its display. Nothing covered: the rect itself, aligned. */
    async snap(rect, { kinds } = {}) {
      const fit = (elements) =>
        snapRect(rect, { elements, displays: displays(), kinds });
      if (closed || !finiteRect(rect)) return fit([]);
      try {
        const raws = await rawWindows();
        const win = windowFor(raws, rect);
        if (win && !blocked(win)) {
          for (const source of sources) {
            const list = await listFrom(source, win, { wait: SNAP_WAIT_MS });
            if (!list) continue;
            if (list.private || privateIds.has(String(win.id))) break;
            const out = fit(list.elements);
            if (out.element)
              return { rect: out.rect, element: copy(out.element) };
          }
        }
      } catch {
        // no element: the aligned rect below
      }
      return fit([]);
    },

    /** Forget every cached list (the pick layer calls this on scroll and click). */
    invalidate() {
      cache.invalidate();
      listed = null;
    },

    async close() {
      closed = true;
      abort.abort();
      cache.invalidate();
      listed = null;
      await Promise.all(
        sources.map(async (s) => {
          try {
            await s.close?.();
          } catch {
            // closing is best effort
          }
        }),
      );
    },
  };
  return api;
}
