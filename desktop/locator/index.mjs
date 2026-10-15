import { execFile } from "node:child_process";
import { createSnapshotCache } from "./cache.mjs";
import { MAX_TEXT, isContainerKind } from "./kinds.mjs";
import { contains, intersection, snapRect } from "./snap.mjs";
import { createWindowIndex } from "./windows.mjs";
import { createAxSource } from "./sources/ax.mjs";
import { axLinux } from "./sources/ax-linux.mjs";
import { axMacos } from "./sources/ax-macos.mjs";
import { axWindows } from "./sources/ax-windows.mjs";
import { createDomSource } from "./sources/dom.mjs";
import { createImageSource } from "./sources/image.mjs";

export { KINDS } from "./kinds.mjs";

/** A hover answers within this; a click and a text read may wait longer. */
const HOVER_BUDGET = 30;
const READ_BUDGET = 250;
const CLICK_TIMEOUT = 400;
/** Keys that move the content under a still pointer. */
const MOVING_KEYS = new Set([
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  " ",
  "Space",
]);

const PLATFORMS = { linux: axLinux, darwin: axMacos, win32: axWindows };
const BROWSER = /chrome|chromium|msedge|edge|brave|vivaldi|opera/i;
const EMPTY = Object.freeze({
  source: null,
  elements: [],
  parents: new Map(),
  byId: new Map(),
  selection: null,
});

const area = (r) => r.width * r.height;
const run = (file, args, { timeout }) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
    );
  });

const SENTENCE = /[^.!?…。！？]+[.!?…。！？]+["'”’)\]]*\s*|[^.!?…。！？]+$/g;
const splitSentences = (text) => text.match(SENTENCE) ?? [text];

/** The smallest element holding the point; among equals, the later (deeper). */
function hit(elements, point) {
  let best = null;
  for (const element of elements) {
    if (area(element.bounds) <= 0 || !contains(element.bounds, point)) continue;
    if (!best || area(element.bounds) <= area(best.bounds)) best = element;
  }
  return best;
}

/** The one place an element is looked for: DOM, then OS accessibility, then the
 * pixels. Every method answers from memory; a window is read in the background
 * and never on the caller's time.
 *
 * `list` and `displays` describe the desktop (native windows, DIP displays),
 * `toDip`/`toNative` convert between native pixels and DIP. `sources` replaces
 * the three real sources, which is how the tests drive the chain. */
export function createLocator({
  companion,
  platform = process.platform,
  capture,
  list = async () => [],
  displays,
  toDip = (p) => p,
  toNative = (p) => p,
  run: runCommand = run,
  isBrowser = (window) => BROWSER.test(window.app ?? ""),
  now = Date.now,
  ttl = 400,
  clickTimeout = CLICK_TIMEOUT,
  sources,
} = {}) {
  if (typeof displays !== "function")
    throw new TypeError("createLocator needs `displays`");
  const windows = createWindowIndex({ list, displays, toDip, now });
  const cache = createSnapshotCache({ now, ttl, budget: HOVER_BUDGET });
  const chain = sources ?? [
    createDomSource({ companion, isBrowser }),
    createAxSource({
      platform: PLATFORMS[platform],
      run: runCommand,
      toDip,
      toNative,
    }),
    createImageSource({ capture }),
  ];
  const keys = new Map(); // window id -> cache key
  let front = null;

  /** A window that moved or resized is a different snapshot. */
  function keyOf(window) {
    const b = window.bounds;
    const key = `${window.id}@${b.x},${b.y},${b.width},${b.height}`;
    const old = keys.get(window.id);
    if (old && old !== key) cache.forget(old);
    keys.set(window.id, key);
    return key;
  }

  /** A raised window may show something else than when it was last read. */
  function observe(all) {
    const top = all[0]?.id ?? null;
    if (top !== front) {
      front = top;
      if (all[0]) cache.invalidate(keyOf(all[0]));
    }
  }

  const loader = (window, at, fresh) => async () => {
    const point = at ?? {
      x: window.bounds.x + window.bounds.width / 2,
      y: window.bounds.y + window.bounds.height / 2,
    };
    for (const source of chain) {
      if (!source.handles(window)) continue;
      let out = null;
      try {
        out = await source.read({
          window,
          display: window.display,
          point,
          fresh,
        });
      } catch {
        out = null;
      }
      if (!out?.elements?.length) continue;
      const byId = new Map(out.elements.map((e) => [e.id, e]));
      return {
        source: source.name,
        elements: out.elements,
        parents: out.parents ?? new Map(),
        byId,
        selection: out.selection ?? null,
      };
    }
    return EMPTY;
  };

  async function snapshot(window, point, budget = HOVER_BUDGET) {
    const result = await cache.read(
      keyOf(window),
      loader(window, point, false),
      { budget },
    );
    return result.value;
  }

  const stack = async (budget) => {
    const all = await windows.all({ budget });
    observe(all);
    return all;
  };

  const secureIn = (snap) => Boolean(snap?.elements.some((e) => e.secure));

  const locator = {
    async locate(point) {
      const window = (await stack(HOVER_BUDGET)).find((w) =>
        contains(w.bounds, point),
      );
      if (!window) return null;
      const snap = await snapshot(window, point);
      return snap ? hit(snap.elements, point) : null;
    },

    async elements(window) {
      if (!window?.bounds) return [];
      const snap = await snapshot(window, undefined, READ_BUDGET);
      return snap ? [...snap.elements] : [];
    },

    async parent(element) {
      if (!element?.window?.bounds) return null;
      const snap = await snapshot(element.window, undefined);
      if (!snap) return null;
      // A sentence is cut from its element and answers to it.
      const cut = element.id.indexOf("#");
      const id =
        cut > 0 ? element.id.slice(0, cut) : snap.parents.get(element.id);
      return id ? (snap.byId.get(id) ?? null) : null;
    },

    /** The sentence under the point, as a rectangle per line. The export has no
     * per-line boxes, so the layout is estimated from the element's size and
     * text length: the sentence is right, its rectangles are a close guess. */
    async sentenceAt(element, point) {
      if (!element || element.secure || !element.text) return null;
      const text = element.text;
      const sentences = splitSentences(text);
      if (sentences.length < 2) return null;
      const { x, y, width, height } = element.bounds;
      if (width <= 0 || height <= 0) return null;
      const font = Math.sqrt((width * height) / (0.7 * text.length));
      const lines = Math.max(1, Math.round(height / (font * 1.4)));
      const lineHeight = height / lines;
      const perLine = text.length / lines;
      const row = Math.min(
        lines - 1,
        Math.max(0, Math.floor((point.y - y) / lineHeight)),
      );
      const column = Math.min(1, Math.max(0, (point.x - x) / width));
      const offset = Math.min(
        text.length - 1,
        row * perLine + column * perLine,
      );
      let start = 0;
      let index = 0;
      for (; index < sentences.length - 1; index++) {
        if (offset < start + sentences[index].length) break;
        start += sentences[index].length;
      }
      const end = start + sentences[index].length;
      const rects = [];
      for (let r = 0; r < lines; r++) {
        const from = Math.max(start, r * perLine);
        const to = Math.min(end, (r + 1) * perLine);
        if (to - from < 1) continue;
        rects.push({
          x: x + (width * (from - r * perLine)) / perLine,
          y: y + r * lineHeight,
          width: (width * (to - from)) / perLine,
          height: lineHeight,
        });
      }
      if (!rects.length) return null;
      const left = Math.min(...rects.map((r) => r.x));
      const top = Math.min(...rects.map((r) => r.y));
      const right = Math.max(...rects.map((r) => r.x + r.width));
      const bottom = Math.max(...rects.map((r) => r.y + r.height));
      return {
        id: `${element.id}#s${index}`,
        kind: "sentence",
        bounds: { x: left, y: top, width: right - left, height: bottom - top },
        lines: rects,
        role: "sentence",
        name: "",
        text: sentences[index].trim().slice(0, MAX_TEXT),
        window: element.window,
        display: element.display,
      };
    },

    /** What the user has selected under the point: browser pages only. */
    async selectionAt(point) {
      const window = (await stack(HOVER_BUDGET)).find((w) =>
        contains(w.bounds, point),
      );
      if (!window) return null;
      const snap = await snapshot(window, point);
      const picked = snap?.selection;
      return picked && contains(picked.bounds, point) ? picked : null;
    },

    /** The text of every leaf element the rectangle covers, in reading order. */
    async textIn(rect) {
      const parts = [];
      let length = 0;
      for (const window of await stack(READ_BUDGET)) {
        if (length >= MAX_TEXT) break;
        if (window.passwordManager || !intersection(window.bounds, rect))
          continue;
        const snap = await snapshot(window, undefined, READ_BUDGET);
        if (!snap) continue;
        const taken = new Set();
        const covered = snap.elements
          .filter((e) => {
            if (e.secure || !e.text || isContainerKind(e.kind)) return false;
            const shared = intersection(e.bounds, rect);
            return shared && area(shared) >= 0.3 * area(e.bounds);
          })
          .sort(
            (a, b) =>
              a.bounds.y - b.bounds.y ||
              a.bounds.x - b.bounds.x ||
              area(b.bounds) - area(a.bounds),
          );
        for (const e of covered) {
          let skip = false;
          for (let up = snap.parents.get(e.id); up; up = snap.parents.get(up)) {
            if (taken.has(up)) {
              skip = true;
              break;
            }
          }
          if (skip) continue;
          taken.add(e.id);
          parts.push(e.text);
          length += e.text.length + 1;
        }
        if (parts.length) break; // the topmost window with text under it
      }
      return parts.join("\n").slice(0, MAX_TEXT);
    },

    /** The front window, and whether it shows a secure field. A secure field in
     * view counts as focus on it: the export does not say which field has the
     * caret, and the cost of the wrong guess is the one that must not happen.
     * Rejects when the window has not been read yet, so a caller fails closed. */
    async focus() {
      const [window] = await stack(HOVER_BUDGET);
      if (!window) return { secure: false, window: null };
      const snap = await snapshot(window, undefined, HOVER_BUDGET);
      if (!snap) throw new Error("focused window not read yet");
      return { secure: secureIn(snap), window };
    },

    async windowAt(point) {
      return (
        (await stack(HOVER_BUDGET)).find((w) => contains(w.bounds, point)) ??
        null
      );
    },

    /** Snaps a drawn rectangle onto the best-matching element under it. */
    async snap(rect, options = {}) {
      const all = await stack(HOVER_BUDGET);
      const window = all.find((w) => {
        const shared = intersection(w.bounds, rect);
        return shared && area(shared) >= 0.5 * area(rect);
      });
      if (!window) return { rect, element: null };
      const snap = await snapshot(window, undefined, READ_BUDGET);
      if (!snap) return { rect, element: null };
      return snapRect(rect, snap.elements, options);
    },

    /** Forgets what was read. `raise`, `move` and `resize` also forget the
     * window list; a `key:<name>` only counts for keys that move content. */
    invalidate(reason = "") {
      if (reason.startsWith("key:") && !MOVING_KEYS.has(reason.slice(4)))
        return false;
      cache.invalidate();
      if (/^(raise|move|resize)/.test(reason)) windows.invalidate();
      return true;
    },

    /** A read that began after this call, for a click. `ok` is false when it
     * could not finish in time, and the click must then lock, not guess. */
    async refresh(point) {
      const all = await windows.all({ fresh: true, budget: clickTimeout });
      observe(all);
      const window = all.find((w) => contains(w.bounds, point));
      if (!window) return { ok: true, window: null };
      const result = await cache.refresh(
        keyOf(window),
        loader(window, point, true),
        { timeout: clickTimeout },
      );
      return { ok: result.state === "fresh", window };
    },
  };
  return locator;
}
