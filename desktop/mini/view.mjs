/** The mini composer's DOM. `mountMini` builds the frame once so the text box
 * keeps focus and its caret while chips come and go; `update` redraws the rest. */
export function mountMini(root, { t, tp, on }) {
  const doc = root.ownerDocument;
  const el = (tag, className, attrs = {}) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  const card = el("div", "mini-card", { role: "dialog" });
  const pause = el("div", "mini-pause");
  pause.hidden = true;
  const entries = el("div", "mini-entries");
  const input = el("textarea", "mini-input", {
    rows: "1",
    "aria-label": t("mini.input"),
    spellcheck: "false",
  });
  const send = el("button", "mini-send", {
    type: "button",
    "aria-label": t("mini.send"),
  });
  send.textContent = "↵";
  const row = el("div", "mini-row");
  row.append(input, send);
  const quick = el("div", "mini-quick", {
    role: "group",
    "aria-label": t("mini.quick"),
  });
  const offers = el("div", "mini-offers");
  card.append(pause, entries, row, quick, offers);
  root.replaceChildren(card);

  input.addEventListener("input", () => on.input(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      on.escape();
    } else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      on.submit();
    }
  });
  send.addEventListener("click", () => on.submit());
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && event.target !== input) {
      event.preventDefault();
      on.escape();
    }
  });

  function entryChip(entry) {
    const chip = el("span", `mini-entry mini-entry-${entry.type}`, {
      "data-id": entry.id,
    });
    const label = entry.type === "image" ? t("mini.image") : t("mini.text");
    if (entry.type === "image") {
      if (entry.thumb) {
        const img = el("img", "mini-thumb", { alt: "", src: entry.thumb });
        chip.append(img);
      }
      const name = el("span", "mini-entry-label");
      name.textContent = label;
      chip.append(name);
      if (entry.tag === "frame") {
        const tag = el("span", "mini-tag");
        tag.textContent = tp("tag.frame");
        chip.append(tag);
      }
    } else {
      const preview = el("span", "mini-entry-label");
      preview.textContent = entry.preview;
      const length = el("span", "mini-entry-length");
      length.textContent = t("mini.chars", { n: entry.length });
      chip.append(preview, length);
    }
    const remove = el("button", "mini-remove", {
      type: "button",
      "aria-label": t("mini.remove", { name: label }),
    });
    remove.textContent = "×";
    remove.addEventListener("click", () => on.remove(entry.id));
    chip.append(remove);
    return chip;
  }

  return {
    input,
    update(view) {
      pause.hidden = !view.pause;
      pause.textContent = view.pause ? tp("mini.pause") : "";
      entries.replaceChildren(...view.entries.map(entryChip));
      quick.hidden = view.chips.length === 0;
      quick.replaceChildren(
        ...view.chips.map((chip) => {
          const button = el(
            "button",
            `mini-chip${chip.highlighted ? " is-default" : ""}`,
            {
              type: "button",
              "data-id": chip.id,
              "aria-pressed": String(chip.highlighted),
            },
          );
          button.textContent = chip.label;
          button.addEventListener("click", () => on.chip(chip.id));
          return button;
        }),
      );
      offers.hidden = view.offers.length === 0;
      offers.replaceChildren(
        ...view.offers.map((offer) => {
          const button = el("button", "mini-offer", {
            type: "button",
            "data-id": offer.id,
          });
          button.textContent =
            offer.id === "translate-page"
              ? tp("translate.page")
              : tp("pdf.offer");
          button.addEventListener("click", () => on.offer(offer.id));
          return button;
        }),
      );
      if (input.value !== view.text && view.text === "") input.value = "";
    },
  };
}
