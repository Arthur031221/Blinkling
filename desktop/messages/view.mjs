import { renderMarkdown, renderImage } from "./render.mjs";
import { translatorFor } from "./strings.mjs";
import { duration, easing, frameLog } from "../shared/motion.mjs";

/** After the reader scrolls, new bubbles wait this long before the deck jumps
 * back to the newest one ("a few seconds", BD-2). */
const READ_HOLD = 4000;
/** The oldest bubble in view is drawn at this opacity; the rest is linear. */
const OLDEST_OPACITY = 0.3;
const FOLLOW_SLACK = 30;
const css = new URL("./deck.css", import.meta.url).href;

/** A scrollable bottom-anchored deck; keys preserve the in-progress sentence.
 *
 * The deck always follows the newest bubble unless the reader scrolled up in
 * the last `READ_HOLD`. Older bubbles fade by opacity alone with their distance
 * from the newest, and the top edge is a mask, never a hard clip. `regions()`
 * is the click-through shape: one rectangle per visible bubble, or the whole
 * column while a wheel or scroll is in flight, because a shape that lags the
 * scroll lets wheel notches fall through to the app underneath (BD-1). */
export function mountMessageBubbles(
  host,
  {
    store,
    openChat,
    onActivity = () => {},
    onReference = () => {},
    onAction = () => {},
    onShape = () => {},
    copy,
    openLink,
    t,
    now = () => performance.now(),
  } = {},
) {
  const doc = host.ownerDocument,
    view = doc.defaultView,
    tr = t ?? translatorFor(doc),
    deck = doc.createElement("div"),
    nodes = new Map(),
    moves = new Map(),
    running = new Set(),
    log = frameLog(),
    reduced = () => view.matchMedia("(prefers-reduced-motion: reduce)").matches;
  deck.className = "gl-bubble-deck";
  deck.setAttribute("role", "log");
  deck.setAttribute("aria-label", tr("deckLabel"));
  deck.setAttribute("aria-live", "polite");
  const sheet = doc.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = css;
  const root = doc.documentElement.style;
  root.setProperty("--motion-fast", `${duration.fast}ms`);
  root.setProperty("--motion-base", `${duration.base}ms`);
  root.setProperty("--motion-slow", `${duration.slow}ms`);
  for (const [name, curve] of Object.entries(easing))
    root.setProperty(`--ease-${name}`, curve);
  host.append(sheet, deck);
  const controller = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, {
      signal: controller.signal,
      ...options,
    });
  listen(deck, "mouseenter", () => store.hover(true, "bubbles"));
  listen(deck, "mouseleave", () => store.hover(false, "bubbles"));

  let following = true,
    solid = false,
    readAt = -Infinity,
    pinned = 0,
    frame,
    settle,
    framing,
    clearance = 0;

  // Scroll events arrive a frame late, after streamed text may have grown the
  // deck again; only a position we did not set ourselves is the reader's.
  const pin = () => {
    deck.scrollTop = deck.scrollHeight;
    pinned = deck.scrollTop;
  };
  const atBottom = () =>
    deck.scrollHeight - deck.clientHeight - deck.scrollTop < FOLLOW_SLACK;

  const rect = (r, bounds) => {
    const left = Math.max(0, Math.ceil(Math.max(r.left, bounds.left))),
      top = Math.max(0, Math.ceil(Math.max(r.top, bounds.top))),
      right = Math.floor(Math.min(r.right, bounds.right)),
      bottom = Math.floor(Math.min(r.bottom, bounds.bottom));
    return {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  };
  /** Window-relative click-through rectangles of the deck. */
  function regions() {
    if (deck.dataset.visible !== "true") return [];
    const bounds = deck.getBoundingClientRect();
    const own = solid
      ? [rect(bounds, bounds)]
      : [...nodes.values()].map((n) => rect(n.getBoundingClientRect(), bounds));
    return own.filter((r) => r.width && r.height);
  }
  const setSolid = (value) => {
    if (solid === value) return;
    solid = value;
    onShape();
  };
  /** The column stays solid while the reader scrolls and for a beat after. */
  const scrolled = () => {
    setSolid(true);
    clearTimeout(settle);
    settle = setTimeout(() => setSolid(false), duration.base);
  };
  listen(deck, "wheel", scrolled, { passive: true });

  /** Age reads through opacity only, and only while following the newest.
   * Distances come from layout (offsetTop), not from rects: a bubble that is
   * mid-slide has a transform that would make it look like it never moved. */
  function age() {
    const bounds = deck.getBoundingClientRect();
    const bottom = (n) => n.offsetTop + n.offsetHeight;
    const newest = [...nodes.values()].at(-1);
    for (const node of nodes.values()) {
      const distance = Math.max(0, bottom(newest) - bottom(node));
      const opacity = following
        ? 1 -
          (1 - OLDEST_OPACITY) *
            Math.min(1, distance / Math.max(1, bounds.height))
        : 1;
      if (opacity >= 0.999) node.style.removeProperty("opacity");
      else node.style.opacity = opacity.toFixed(3);
      const clipped =
        node.dataset.kind !== "open-chat" &&
        node.scrollHeight > node.clientHeight + 1;
      if (clipped !== (node.dataset.clipped === "true")) {
        node.dataset.clipped = String(clipped);
        if (clipped) {
          node.tabIndex = 0;
          node.setAttribute("role", "button");
          node.setAttribute("aria-label", tr("openFull"));
        } else {
          node.removeAttribute("tabindex");
          node.removeAttribute("role");
          node.removeAttribute("aria-label");
        }
      }
    }
  }
  listen(
    deck,
    "scroll",
    () => {
      if (Math.abs(deck.scrollTop - pinned) > 1.5) {
        following = atBottom();
        readAt = now();
        pinned = deck.scrollTop;
        scrolled();
      }
      age();
      onShape();
    },
    { passive: true },
  );

  /** Every motion is a Web Animation on transform or opacity that a newer one
   * replaces from wherever the old one had got to (N6.2, N6.3). */
  function play(node, keyframes, options) {
    if (reduced() || typeof node.animate !== "function") return;
    moves.get(node)?.cancel();
    const animation = node.animate(keyframes, options);
    moves.set(node, animation);
    running.add(animation);
    const done = () => {
      running.delete(animation);
      if (moves.get(node) === animation) moves.delete(node);
    };
    animation.addEventListener?.("finish", done);
    animation.addEventListener?.("cancel", done);
    if (!framing) {
      const tick = () => {
        if (!running.size) {
          framing = undefined;
          return;
        }
        log("deck", deck.getBoundingClientRect());
        framing = requestAnimationFrame(tick);
      };
      framing = requestAnimationFrame(tick);
    }
  }
  /** The tail corner stays put, so a growing bubble never leaves the deck. */
  const enter = (node) =>
    play(node, [{ opacity: 0, transform: "scale(0.94)" }], {
      duration: duration.base,
      easing: easing.enter,
    });
  const slide = (node, dy) =>
    play(node, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
      duration: duration.base,
      easing: easing.standard,
    });
  const fadeDeck = (visible) => {
    const from = Number.parseFloat(view.getComputedStyle(deck).opacity);
    deck.dataset.visible = String(visible);
    play(deck, [{ opacity: Number.isFinite(from) ? from : Number(!visible) }], {
      duration: duration.base,
      easing: visible ? easing.enter : easing.exit,
    });
  };

  function build(part) {
    const node = doc.createElement("article");
    node.className = "gl-answer-bubble";
    node.dataset.id = part.id;
    node.dataset.openLabel = tr("openChat");
    node.addEventListener("click", (e) => {
      if (node.dataset.clipped === "true" && !e.target.closest("a, button"))
        openChat?.(node.dataset.messageId);
    });
    node.addEventListener("keydown", (e) => {
      if (
        node.dataset.clipped === "true" &&
        e.target === node &&
        (e.key === "Enter" || e.key === " ")
      ) {
        e.preventDefault();
        openChat?.(node.dataset.messageId);
      }
    });
    return node;
  }
  function fill(node, part) {
    node.replaceChildren();
    node.dataset.kind = part.kind;
    if (part.messageId) node.dataset.messageId = part.messageId;
    if (part.kind === "open-chat") {
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = tr("openChat");
      button.addEventListener("click", () => openChat?.(part.messageId));
      node.append(button);
    } else if (part.kind === "image") {
      const image = renderImage(doc, part.image, tr);
      if (image) node.append(image);
    } else if (part.kind === "failure") {
      const line = doc.createElement("p");
      line.className = "gl-say";
      line.textContent = part.markdown;
      const chips = doc.createElement("div");
      chips.className = "gl-actions";
      for (const action of part.actions) {
        const chip = doc.createElement("button");
        chip.type = "button";
        chip.className = "gl-chip";
        chip.textContent = action.label;
        chip.addEventListener("click", () => onAction(action.id));
        chips.append(chip);
      }
      node.append(line, chips);
    } else if (part.kind === "say") {
      const line = doc.createElement("p");
      line.className = "gl-say";
      line.textContent = part.markdown;
      node.append(line);
    } else {
      if (part.marker) {
        const marker = doc.createElement("span");
        marker.className = "gl-point-marker";
        marker.textContent = part.marker;
        node.append(marker);
        node.classList.add("gl-point");
      }
      node.append(
        renderMarkdown(doc, part.markdown, { copy, openLink, t: tr }),
      );
    }
  }

  const unsub = store.subscribe((state) => {
    // Whether to stay on the newest bubble is decided before the content moves.
    const stay = following || now() - readAt > READ_HOLD;
    const before = new Map(
      [...nodes].map(([id, n]) => [id, n.getBoundingClientRect().top]),
    );
    const keep = new Set(state.bubbles.map((p) => p.id));
    for (const [id, n] of nodes)
      if (!keep.has(id)) {
        moves.get(n)?.cancel();
        n.remove();
        nodes.delete(id);
      }
    let cursor = deck.firstElementChild;
    const added = [];
    for (const part of state.bubbles) {
      let node = nodes.get(part.id);
      if (!node) {
        node = build(part);
        nodes.set(part.id, node);
        deck.append(node);
        added.push(node);
      }
      const signature = JSON.stringify(part);
      if (node.dataset.signature !== signature) {
        node.dataset.signature = signature;
        fill(node, part);
      }
      // A long answer's link must move after newly streamed parts, not stay
      // where it first appeared. Reorder only changed positions to keep keys.
      if (node !== cursor) deck.insertBefore(node, cursor);
      cursor = node.nextElementSibling;
    }
    if (stay && state.bubbles.length) {
      pin();
      following = true;
    }
    for (const node of added) enter(node);
    for (const [id, node] of nodes) {
      if (!before.has(id)) continue;
      const dy = before.get(id) - node.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) slide(node, dy);
    }
    if (deck.dataset.visible !== String(state.visible)) {
      if (deck.dataset.visible === undefined)
        deck.dataset.visible = String(state.visible);
      else fadeDeck(state.visible);
    }
    onActivity({ visible: state.visible, speaking: state.speaking });
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      age();
      onShape();
    });
  });

  const badge = (event) => event.target.closest?.(".gl-ref");
  listen(deck, "mouseover", (e) => {
    const b = badge(e);
    if (b) onReference({ ref: b.dataset.ref });
  });
  listen(deck, "mouseout", (e) => {
    if (badge(e)) onReference({ ref: null });
  });

  return {
    element: deck,
    regions,
    hover: (value) => store.hover(value),
    /** Scroll the bubble that carries a reference into view. */
    reveal(ref) {
      const badges = [...deck.querySelectorAll(".gl-ref")].filter(
        (b) => b.dataset.ref === ref,
      );
      const node = badges.at(-1)?.closest(".gl-answer-bubble");
      if (!node || deck.dataset.visible !== "true") return false;
      const bounds = deck.getBoundingClientRect(),
        r = node.getBoundingClientRect();
      if (r.top < bounds.top) deck.scrollTop += r.top - bounds.top - 8;
      else if (r.bottom > bounds.bottom)
        deck.scrollTop += r.bottom - bounds.bottom + 8;
      following = atBottom();
      readAt = now();
      pinned = deck.scrollTop;
      age();
      return true;
    },
    /** Keep the deck clear of the open fan (`snapshot().menu`, window space). */
    avoid(menu) {
      const bounds = host.getBoundingClientRect();
      const floor = bounds.bottom + clearance;
      const overlaps =
        menu &&
        menu.x < bounds.right &&
        menu.x + menu.width > bounds.left &&
        menu.y < floor;
      clearance = overlaps ? Math.max(0, floor - menu.y) : 0;
      host.style.setProperty("--gl-clear", `${clearance}px`);
      age();
      onShape();
    },
    dispose() {
      controller.abort();
      clearTimeout(settle);
      store.hover(false, "bubbles");
      unsub();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(framing);
      for (const animation of running) animation.cancel();
      sheet.remove();
      deck.remove();
    },
  };
}
