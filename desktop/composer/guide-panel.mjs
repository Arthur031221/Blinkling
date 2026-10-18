/** The guide's bubbles and buttons in the chat card. Each guide event
 * updates what is already there: a bubble whose text is unchanged is the same
 * node, so it does not play its entrance again, and only a bubble that is new
 * grows in. */
export function mountGuidePanel({ host, tr, onAction }) {
  const bubbles = [];
  const buttons = new Map();
  let headNode = null,
    listNode = null;

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

  /** "Step 2 of 5 · Heading": where the tour is, above the step's text. */
  function head(text) {
    if (!text) {
      headNode?.remove();
      headNode = null;
      return;
    }
    if (!headNode) {
      headNode = host.ownerDocument.createElement("p");
      headNode.className = "gl-guide-head";
    }
    if (headNode.textContent !== text) headNode.textContent = text;
    host.prepend(headNode);
  }
  /** All steps: one row per step, each a way into that step. */
  function list(steps) {
    if (!steps?.length) {
      listNode?.remove();
      listNode = null;
      return;
    }
    if (!listNode) {
      listNode = host.ownerDocument.createElement("ol");
      listNode.className = "gl-guide-steps";
    }
    const rows = steps.map((step, i) => {
      const row = button(
        `step-${i}`,
        `${i + 1}  ${step.title}`,
        `guide-step-${i + 1}`,
      );
      row.className = "gl-guide-step";
      row.title = step.note;
      return row;
    });
    for (const key of [...buttons.keys()])
      if (key.startsWith("step-") && !rows.includes(buttons.get(key))) {
        buttons.get(key).remove();
        buttons.delete(key);
      }
    listNode.replaceChildren(...rows);
  }

  return {
    update(event) {
      const offer = event.phase === "dismissed" && event.again;
      host.hidden = event.phase === "dismissed" && !offer;
      const texts =
        event.bubbles ??
        (event.phase === "thinking"
          ? [tr("guide-thinking")]
          : offer
            ? [tr("guide-again-note")]
            : []);
      texts.forEach((text, index) => bubble(index, text));
      for (const node of bubbles.splice(texts.length)) node.remove();
      head(
        event.phase === "step"
          ? [
              tr("guide-step", { n: event.index + 1, total: event.total }),
              event.title,
            ]
              .filter(Boolean)
              .join(" · ")
          : "",
      );
      list(event.phase === "overview" ? event.steps : null);
      if (listNode) host.append(listNode);

      const wanted = [];
      if (event.phase === "overview")
        wanted.push(
          button("next", tr("guide-start"), "guide-next", event.canNext),
          button("dismiss", tr("guide-dismiss"), "guide-dismiss"),
        );
      if (event.phase === "step")
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
      if (offer) wanted.push(button("again", tr("guide-again"), "guide-again"));
      if (event.phase === "error")
        wanted.push(
          button("retry", tr("guide-retry"), "guide-retry"),
          button("close", tr("guide-close"), "guide-dismiss"),
        );
      for (const [key, node] of buttons)
        if (!key.startsWith("step-") && !wanted.includes(node)) {
          node.remove();
          buttons.delete(key);
        }
      // Appending moves a node that is already there, which keeps the order.
      for (const node of wanted) host.append(node);
    },
  };
}
