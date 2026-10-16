/** The guide's bubbles and buttons in the chat card. Each guide event
 * updates what is already there: a bubble whose text is unchanged is the same
 * node, so it does not play its entrance again, and only a bubble that is new
 * grows in. */
export function mountGuidePanel({ host, tr, onAction }) {
  const bubbles = [];
  const buttons = new Map();

  function bubble(index, text) {
    let node = bubbles[index];
    if (!node) {
      node = host.ownerDocument.createElement("p");
      node.className = "gl-answer-bubble";
      bubbles[index] = node;
      host.append(node);
    }
    if (node.textContent !== text) node.textContent = text;
  }
  function button(key, label, action, enabled = true) {
    let node = buttons.get(key);
    if (!node) {
      node = host.ownerDocument.createElement("button");
      node.type = "button";
      node.addEventListener("click", () => onAction(node.dataset.action));
      buttons.set(key, node);
    }
    if (node.textContent !== label) node.textContent = label;
    node.dataset.action = action;
    node.disabled = !enabled;
    return node;
  }

  return {
    update(event) {
      host.hidden = event.phase === "dismissed";
      const texts =
        event.bubbles ??
        (event.phase === "thinking" ? [tr("guide-thinking")] : []);
      texts.forEach((text, index) => bubble(index, text));
      for (const node of bubbles.splice(texts.length)) node.remove();

      const wanted = [];
      if (["overview", "step"].includes(event.phase))
        wanted.push(
          button("back", tr("guide-back"), "guide-back", event.canBack),
          button(
            "next",
            tr(event.last ? "guide-done" : "guide-next"),
            "guide-next",
            event.canNext,
          ),
          button("overview", tr("guide-overview"), "guide-overview"),
          button("dismiss", tr("guide-dismiss"), "guide-dismiss"),
        );
      if (event.phase === "finished")
        wanted.push(
          button("back", tr("guide-back"), "guide-back", event.canBack),
          button("overview", tr("guide-overview"), "guide-overview"),
          button("dismiss", tr("guide-dismiss"), "guide-dismiss"),
        );
      if (event.phase === "error")
        wanted.push(
          button("retry", tr("guide-retry"), "guide-retry"),
          button("close", tr("guide-close"), "guide-dismiss"),
        );
      for (const [key, node] of buttons)
        if (!wanted.includes(node)) {
          node.remove();
          buttons.delete(key);
        }
      // Appending moves a node that is already there, which keeps the order.
      for (const node of wanted) host.append(node);
    },
  };
}
