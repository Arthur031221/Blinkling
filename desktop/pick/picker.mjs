import { tableMarkdown } from "./taken.mjs";

/** The most things one pick can hold; the seventh is refused (M4). */
export const MAX_ITEMS = 6;
/** Longest gap, in DIP, between samples when looking for secure content in an area. */
const SAMPLE_STEP = 12;
const SAMPLE_MAX = 12;

const inside = (r, p) =>
  p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
const same = (a, b) =>
  ["x", "y", "width", "height"].every((k) => a[k] === b[k]);
const isSecure = (el) => el?.secure === true;

/** Decides what a click or hover means. It knows nothing about windows, keys or
 * pixels: it asks the locator what is under a point and answers with plain
 * data, so the whole policy is unit tested.
 *
 * locator: locate(point), parent(el), selectionAt(point), textIn(rect),
 *   focus(), and optionally sentenceAt(el, point) and windowAt(point).
 * guard: allowed() is false while a blocked app is in front (privacy). */
export function createPicker({ locator, guard, display }) {
  let items = [];

  const base = (extra) => ({ source: "pick", display, ...extra });
  const windowInfo = (w) =>
    w
      ? {
          window: { id: w.id, title: w.title, ...(w.pdf ? { pdf: true } : {}) },
          ...(w.browser ? { browser: true } : {}),
        }
      : {};

  async function chainOf(el) {
    const chain = [el];
    for (
      let up = await locator.parent(el);
      up && chain.length < 64;
      up = await locator.parent(up)
    )
      chain.push(up);
    return chain;
  }

  async function takenFromElement(el) {
    const common = {
      bounds: el.bounds,
      elementId: el.id,
      ...windowInfo(el.window),
    };
    switch (el.kind) {
      case "text":
        return base({
          ...common,
          kind: "text",
          text: el.text ?? "",
          lines: el.lines ?? [],
        });
      case "table":
        return base({
          ...common,
          kind: "table",
          text: tableMarkdown(el.content?.rows ?? []),
        });
      case "code": {
        const code = el.content?.code;
        const body = code?.text ?? el.text ?? "";
        return base({
          ...common,
          kind: "code",
          text: `\`\`\`${code?.language ?? ""}\n${body}\n\`\`\``,
        });
      }
      case "formula": {
        const latex = el.content?.latex;
        return base({
          ...common,
          kind: "formula",
          ...(latex
            ? { text: `$$${latex}$$` }
            : el.text
              ? { text: el.text }
              : {}),
        });
      }
      case "section":
      case "page":
        return base({
          ...common,
          kind: el.kind,
          text: await locator.textIn(el.bounds),
        });
      case "titlebar":
        return takenFromWindow(el.window);
      case "image":
      case "chart":
      case "video":
      case "control":
        return base({ ...common, kind: el.kind });
      default:
        return base({
          ...common,
          kind: "section",
          text: await locator.textIn(el.bounds),
        });
    }
  }

  function takenFromWindow(w) {
    return base({ kind: "window", bounds: w.bounds, ...windowInfo(w) });
  }

  const levelOf = (el) =>
    el.kind === "section" || el.kind === "page"
      ? el.kind
      : el.kind === "text"
        ? "paragraph"
        : "element";

  /** The rungs a click on `el` can climb: sentence, paragraph, section, page. */
  async function ladderFor(el, chain, point) {
    const rungs = [];
    if (el.kind === "titlebar")
      return [
        { level: "window", taken: async () => takenFromWindow(el.window) },
      ];
    if (el.kind === "text" && locator.sentenceAt) {
      const sentence = await locator.sentenceAt(el, point);
      if (sentence)
        rungs.push({
          level: "sentence",
          taken: async () =>
            base({
              kind: "text",
              text: sentence.text,
              bounds: sentence.bounds,
              lines: sentence.lines ?? [],
              elementId: el.id,
              ...windowInfo(el.window),
            }),
        });
    }
    rungs.push({
      level: levelOf(el),
      taken: () => takenFromElement(el),
      bounds: el.bounds,
    });
    for (const up of chain.slice(1)) {
      if (same(up.bounds, rungs[rungs.length - 1].bounds ?? {})) continue;
      rungs.push({
        level: up.kind === "page" ? "page" : "section",
        taken: () => takenFromElement(up),
        bounds: up.bounds,
      });
    }
    return rungs;
  }

  /** Looks under the point. Returns {lock} or what a first click would take. */
  async function resolve(point) {
    if (guard.allowed({ point }) === false) return { lock: true };
    const focus = await locator.focus();
    if (focus?.secure) return { lock: true };
    const selection = await locator.selectionAt(point);
    if (selection)
      return {
        rungs: [
          {
            level: "selection",
            taken: async () =>
              base({
                kind: "text",
                text: selection.text,
                bounds: selection.bounds,
                lines: selection.lines ?? [],
              }),
          },
        ],
        selection,
      };
    const el = await locator.locate(point);
    if (!el) {
      const w = await locator.windowAt?.(point);
      return {
        rungs: [
          w
            ? { level: "window", taken: async () => takenFromWindow(w) }
            : {
                level: "screen",
                taken: async () =>
                  base({ kind: "screen", bounds: display.bounds }),
              },
        ],
      };
    }
    const chain = await chainOf(el);
    if (chain.some(isSecure)) return { lock: true };
    return { el, rungs: await ladderFor(el, chain, point) };
  }

  /** A secure element anywhere under an area locks the whole area. */
  async function areaIsSecure(rect) {
    const cols = Math.min(SAMPLE_MAX, Math.ceil(rect.width / SAMPLE_STEP) + 1);
    const rows = Math.min(SAMPLE_MAX, Math.ceil(rect.height / SAMPLE_STEP) + 1);
    const points = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        points.push({
          x: rect.x + (cols > 1 ? ((rect.width - 1) * c) / (cols - 1) : 0),
          y: rect.y + (rows > 1 ? ((rect.height - 1) * r) / (rows - 1) : 0),
        });
    const found = await Promise.all(points.map((p) => locator.locate(p)));
    const seen = new Set();
    for (const el of found) {
      if (!el || seen.has(el.id)) continue;
      seen.add(el.id);
      if ((await chainOf(el)).some(isSecure)) return true;
    }
    return false;
  }

  const view = (item) => ({ level: item.level, taken: item.taken });

  return {
    items: () => items.map(view),
    drain() {
      const taken = items.map((i) => i.taken);
      items = [];
      return taken;
    },
    clear() {
      items = [];
    },

    async hover(point) {
      const r = await resolve(point);
      if (r.lock) return { outline: null, kind: null, lock: true };
      const taken = await r.rungs[0].taken();
      return { outline: taken.bounds, kind: taken.kind, lock: false };
    },

    async click(point) {
      const r = await resolve(point);
      if (r.lock) return { type: "lock", at: point };
      // The same element again, inside what it already gave: grow one level.
      const id = r.el?.id;
      const existing = id
        ? items.find((i) => i.originId === id && inside(i.taken.bounds, point))
        : r.selection
          ? items.find(
              (i) =>
                i.level === "selection" && i.taken.text === r.selection.text,
            )
          : undefined;
      if (existing) {
        const rung = existing.rungs[existing.rung + 1];
        if (!rung) return { type: "taken", item: view(existing), grew: false };
        existing.rung += 1;
        existing.level = rung.level;
        existing.taken = await rung.taken();
        return { type: "taken", item: view(existing), grew: true };
      }
      if (items.length >= MAX_ITEMS)
        return { type: "refused", reason: "limit" };
      const first = r.rungs[0];
      const item = {
        level: first.level,
        taken: await first.taken(),
        originId: id,
        rungs: r.rungs,
        rung: 0,
      };
      items.push(item);
      return { type: "taken", item: view(item), grew: false };
    },

    async area(rect) {
      const bounds = {
        ...rect,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      };
      if (
        guard.allowed({ rect: bounds }) === false ||
        (await locator.focus())?.secure
      )
        return { type: "lock", at: { x: bounds.x, y: bounds.y } };
      if (await areaIsSecure(bounds))
        return { type: "lock", at: { x: bounds.x, y: bounds.y } };
      if (items.length >= MAX_ITEMS)
        return { type: "refused", reason: "limit" };
      const item = {
        level: "area",
        taken: base({ kind: "area", bounds }),
        rungs: [],
        rung: 0,
      };
      items.push(item);
      return { type: "taken", item: view(item), grew: false };
    },
  };
}
