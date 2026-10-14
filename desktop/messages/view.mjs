import { renderMarkdown, renderImage } from "./render.mjs";

/** A scrollable bottom-anchored deck; keys preserve the in-progress sentence. */
export function mountMessageBubbles(
  host,
  { store, openChat, onActivity = () => {}, copy, openLink } = {},
) {
  const doc = host.ownerDocument,
    deck = doc.createElement("div"),
    nodes = new Map();
  deck.className = "gl-bubble-deck";
  deck.setAttribute("role", "log");
  deck.setAttribute("aria-label", "Blink 的回答");
  deck.setAttribute("aria-live", "polite");
  host.append(deck);
  const controller = new AbortController();
  deck.addEventListener("mouseenter", () => store.hover(true, "bubbles"), {
    signal: controller.signal,
  });
  deck.addEventListener("mouseleave", () => store.hover(false, "bubbles"), {
    signal: controller.signal,
  });
  let wasVisible = false,
    following = true,
    scrolling = false,
    frame;
  function age() {
    const bounds = deck.getBoundingClientRect();
    for (const node of nodes.values()) {
      const r = node.getBoundingClientRect();
      const distance = Math.max(0, bounds.bottom - r.bottom);
      node.style.opacity = String(
        scrolling
          ? 1
          : Math.max(0.32, 1 - (distance / Math.max(1, bounds.height)) * 0.7),
      );
    }
  }
  deck.addEventListener(
    "scroll",
    () => {
      following = deck.scrollHeight - deck.clientHeight - deck.scrollTop < 30;
      scrolling = !following;
      age();
    },
    { passive: true },
  );
  const unsub = store.subscribe((state) => {
    const bottom = following;
    const old = new Map(
      [...nodes].map(([id, n]) => [id, n.getBoundingClientRect().top]),
    );
    const keep = new Set(state.bubbles.map((p) => p.id));
    for (const [id, n] of nodes)
      if (!keep.has(id)) {
        n.remove();
        nodes.delete(id);
      }
    let cursor = deck.firstElementChild;
    for (const part of state.bubbles) {
      let node = nodes.get(part.id);
      if (!node) {
        node = doc.createElement("article");
        node.className = "gl-answer-bubble";
        node.dataset.id = part.id;
        nodes.set(part.id, node);
        deck.append(node);
        if (
          !doc.defaultView.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
        )
          node.animate(
            [
              { opacity: 0, transform: "translateY(12px) scale(.94)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 260, easing: "cubic-bezier(.16,1.3,.3,1)" },
          );
      }
      const signature = JSON.stringify(part);
      if (node.dataset.signature !== signature) {
        node.replaceChildren();
        node.dataset.signature = signature;
        if (part.kind === "open-chat") {
          const button = doc.createElement("button");
          button.type = "button";
          button.textContent = "在對話中開啟";
          button.addEventListener("click", () => openChat?.(part.messageId));
          node.append(button);
        } else if (part.kind === "image") {
          const image = renderImage(doc, part.image);
          if (image) node.append(image);
        } else {
          if (part.marker) {
            const marker = doc.createElement("span");
            marker.className = "gl-point-marker";
            marker.textContent = part.marker;
            node.append(marker);
            node.classList.add("gl-point");
          }
          node.append(renderMarkdown(doc, part.markdown, { copy, openLink }));
        }
      }
      // A long answer's link must move after newly streamed parts, not stay
      // where it first appeared. Reorder only changed positions to keep keys.
      if (node !== cursor) deck.insertBefore(node, cursor);
      cursor = node.nextElementSibling;
    }
    if (bottom) deck.scrollTop = deck.scrollHeight;
    const reduced = doc.defaultView.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    for (const [id, node] of nodes) {
      if (old.has(id) && !reduced) {
        const dy = old.get(id) - node.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5)
          node.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
            { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
      }
    }
    deck.dataset.visible = String(state.visible);
    if (wasVisible !== state.visible) {
      onActivity({ visible: state.visible, speaking: state.speaking });
      wasVisible = state.visible;
    } else onActivity({ visible: state.visible, speaking: state.speaking });
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(age);
  });
  return {
    element: deck,
    hover: (value) => store.hover(value),
    dispose() {
      controller.abort();
      store.hover(false, "bubbles");
      unsub();
      cancelAnimationFrame(frame);
      deck.remove();
    },
  };
}
