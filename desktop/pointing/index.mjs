import { pixelRectToDip } from "../main/geometry.mjs";
import { markKind, seedOf } from "./shapes.mjs";
import { badgeRect } from "./badge.mjs";
import { elementsForPrompt, pointingInstructions } from "./elements.mjs";

/** How often main looks at the cursor (badge clicks) and at the marked
 * elements (moved or gone). Neither is motion, so neither is a motion token. */
export const POLL = Object.freeze({ cursorMs: 50, watchMs: 1000 });
const MOVED = 2;
const contains = (r, p) =>
  p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
const same = (a, b) =>
  ["x", "y", "width", "height"].every((k) => Math.abs(a[k] - b[k]) <= MOVED);
const relative = (r, origin) => ({
  x: r.x - origin.x,
  y: r.y - origin.y,
  width: r.width,
  height: r.height,
});

/** The part of `rect` on a display of `size`, or null when none of it is. */
function trim(rect, size) {
  const x = Math.max(0, rect.x),
    y = Math.max(0, rect.y);
  const width = Math.min(size.width, rect.x + rect.width) - x,
    height = Math.min(size.height, rect.y + rect.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Draws numbered marks on the screen for the things an answer or a guide
 * names (M3, N2.3). One engine, so an answer and a guide look the same:
 * same kinds, numbering, snapping and labels.
 *
 * `overlay` is the overlay service (show, command, setInteractive, dismiss and
 * its `mark-click` / `dismissed` events). `card` emits `revive` when the chat
 * card opens and `fade` when it closes, so marks never outlive their answer. */
export function createPointing({
  locator,
  overlay,
  card,
  cursor = () => null,
  poll = POLL,
  log = () => {},
} = {}) {
  let state = null;
  let interactive = false;
  // Bumped by every show and clear; a draw that finds it moved was cancelled.
  let generation = 0;
  let inFlight = 0;
  let cursorTimer = null;
  let watchTimer = null;
  let busy = false;
  const clicks = new Set();

  const displayOf = (id) => {
    const found = overlay.displays
      ?.getAllDisplays()
      .find((d) => String(d.id) === String(id));
    return found
      ? {
          id: String(found.id),
          bounds: { ...found.bounds },
          scaleFactor: found.scaleFactor,
        }
      : null;
  };
  const plain = (d) => ({
    id: String(d.id),
    bounds: { ...d.bounds },
    scaleFactor: d.scaleFactor,
  });

  function stop() {
    clearInterval(cursorTimer);
    clearInterval(watchTimer);
    cursorTimer = watchTimer = null;
    if (interactive) overlay.setInteractive?.(false);
    interactive = false;
    state = null;
  }
  overlay.on("dismissed", stop);
  overlay.on("mark-click", (n) => {
    for (const fn of [...clicks]) fn(n);
  });
  // The card sits above the marks; what lies under it is cut out of the overlay.
  let cardAt = null,
    covering = false;
  const cover = () => {
    if (!state || (!cardAt && !covering)) return;
    covering = Boolean(cardAt);
    const o = state.capture.display.bounds;
    overlay.command(
      "cover",
      cardAt
        ? [
            {
              x: cardAt.x - o.x,
              y: cardAt.y - o.y,
              width: cardAt.width,
              height: cardAt.height,
            },
          ]
        : [],
    );
  };
  card?.on("bounds", (rect) => {
    cardAt = rect;
    cover();
  });
  card?.on("fade", () => state && overlay.command("fade"));
  card?.on("revive", () => state && overlay.command("revive"));

  async function resolve(ref, ctx) {
    const base = { n: ref.n, number: ref.n, label: ref.label ?? "", steps: [] };
    if (ref.elementId) {
      const el = ctx.elements.find((e) => e.id === ref.elementId);
      if (!el?.bounds || !el.display) return null;
      const display = plain(el.display);
      if (ctx.display && ctx.display.id !== display.id) return null;
      ctx.display ??= display;
      const origin = display.bounds;
      const rect = trim(relative(el.bounds, origin), origin);
      if (!rect) return null;
      return {
        ...base,
        id: el.id,
        elementId: el.id,
        rect,
        kind: ref.kind ?? markKind(el),
        seed: seedOf(`${el.id}${ref.label ?? ""}`),
        lines: (el.lines ?? []).map((l) => relative(l, origin)),
      };
    }
    const display = ctx.display;
    if (!display || !ref.rect) return null;
    let rect = ctx.capture ? pixelRectToDip(ref.rect, ctx.capture) : ref.rect;
    let element = null;
    if (ctx.snap && locator?.snap) {
      const o = display.bounds;
      const hit = await locator
        .snap({ ...rect, x: rect.x + o.x, y: rect.y + o.y })
        .catch(() => null);
      const bounds = hit?.bounds ?? (hit?.width ? hit : null);
      if (bounds) {
        rect = relative(bounds, o);
        element = hit.element ?? null;
      }
    }
    rect = trim(rect, display.bounds);
    if (!rect) return null;
    return {
      ...base,
      id: element?.id ?? `box:${ref.n}`,
      ...(element?.id ? { elementId: element.id } : {}),
      rect,
      kind: ref.kind ?? (element ? markKind(element) : "outline"),
      seed: seedOf(`${ref.n}${ref.label ?? ""}`),
      lines: (element?.lines ?? []).map((l) => relative(l, display.bounds)),
    };
  }

  const badges = () => {
    if (!state) return [];
    const o = state.capture.display.bounds;
    return state.drawings.map((d) => {
      const b = badgeRect(d.rect, o);
      return { ...b, n: d.n, x: b.x + o.x, y: b.y + o.y };
    });
  };

  const api = {
    /** refs: [{n, elementId | rect, label, kind?}]. A ref that no longer
     * resolves is skipped and the rest keep their numbers. Resolves true when
     * something was drawn. `capture` makes box refs screenshot pixels. */
    async show(refs, { displayId, capture, window, snap } = {}) {
      const mine = ++generation;
      const ctx = {
        capture,
        snap: snap ?? !capture,
        display: capture?.display
          ? plain(capture.display)
          : displayId !== undefined
            ? displayOf(displayId)
            : null,
        elements: refs.some((r) => r.elementId)
          ? await locator.elements(window).catch(() => [])
          : [],
      };
      const drawings = [];
      for (const ref of refs) {
        const drawing = await resolve(ref, ctx);
        if (drawing) drawings.push(drawing);
      }
      if (mine !== generation) return false;
      if (!drawings.length || !ctx.display) {
        api.clear("nothing-to-point-at");
        return false;
      }
      // The service compares the display by value, so it gets the plain form.
      const shownCapture = { ...capture, display: ctx.display };
      inFlight++;
      const shown = await overlay.show(shownCapture, drawings).finally(() => {
        inFlight--;
      });
      if (shown === false || mine !== generation) return false;
      state = { capture: shownCapture, drawings, window };
      covering = false;
      cover();
      clearInterval(cursorTimer);
      clearInterval(watchTimer);
      cursorTimer = setInterval(api.poll, poll.cursorMs);
      watchTimer = setInterval(api.check, poll.watchMs);
      cursorTimer.unref?.();
      watchTimer.unref?.();
      log(`[blinkling] pointing at ${drawings.length}`);
      return true;
    },
    pulse(n) {
      if (state && Number.isInteger(n)) overlay.command("pulse", n);
    },
    /** One number, a list (a guide step names several marks) or null for all. */
    focus(which, { solo = false } = {}) {
      if (state)
        overlay.command(solo && which !== null ? "solo" : "focus", which);
    },
    clear(reason = "user") {
      generation++;
      if (!state && !inFlight) return;
      overlay.dismiss(reason);
      stop();
    },
    numberOf(ref) {
      if (typeof ref !== "string") return null;
      return (
        state?.drawings.find((d) => d.elementId === ref || d.id === ref)?.n ??
        null
      );
    },
    onMarkClick(fn) {
      clicks.add(fn);
      return () => clicks.delete(fn);
    },
    badges,
    /** Marks are click-through; only the badge under the cursor takes clicks. */
    poll() {
      const point = state && cursor();
      if (!point) return;
      const over =
        badges().some((b) => contains(b, point)) ||
        (overlay.regions?.(["badge", "label"]) ?? []).some((r) =>
          contains(r, point),
        );
      if (over === interactive) return;
      interactive = over;
      overlay.setInteractive?.(over);
    },
    /** Dismisses the marks when an element they sit on moved or is gone. */
    async check() {
      if (busy || !state) return;
      busy = true;
      const current = state;
      try {
        const watched = current.drawings.filter((d) => d.elementId);
        if (!watched.length) return;
        const elements = await locator.elements(current.window);
        if (state !== current) return;
        const o = current.capture.display.bounds;
        const moved = watched.some((d) => {
          const el = elements.find((e) => e.id === d.elementId);
          return !el?.bounds || !same(relative(el.bounds, o), d.rect);
        });
        if (moved) api.clear("content-changed");
      } catch {
        // A locator that cannot answer is not evidence that the screen changed.
      } finally {
        busy = false;
      }
    },
    /** `'<id> <kind> <name/text>'` lines for a screen question. */
    async elementsForPrompt(window) {
      if (!window) return [];
      try {
        return elementsForPrompt(await locator.elements(window));
      } catch {
        return [];
      }
    },
    async instructions(window) {
      return pointingInstructions(await api.elementsForPrompt(window));
    },
    get active() {
      return !!state;
    },
  };
  return api;
}
