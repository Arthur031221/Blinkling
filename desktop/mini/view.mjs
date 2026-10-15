import { createSelectionPickers } from "../composer/selection.mjs";

const ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.txt";

/** The mini composer's DOM. `mountMini` builds the frame once so the text box
 * keeps focus and its caret while chips come and go; `update` redraws the rest. */
export function mountMini(root, { t, tp, tc, on }) {
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
  const controller = new (doc.defaultView?.AbortController ??
    AbortController)();
  const toolbar = el("div", "mini-toolbar");
  const add = el("button", "mini-add", {
    type: "button",
    "aria-label": tc("add"),
    title: tc("add"),
  });
  add.textContent = "+";
  const file = el("input", "", {
    type: "file",
    multiple: "",
    accept: ACCEPT,
    hidden: "",
  });
  const pickers = createSelectionPickers(doc, {
    tr: tc,
    signal: controller.signal,
    onChoose: (wanted) => on.select(wanted),
  });
  const dot = () => {
    const d = el("span", "gl-picker-dot");
    d.textContent = "·";
    return d;
  };
  toolbar.append(
    add,
    file,
    pickers.model.element,
    dot(),
    pickers.effort.element,
    dot(),
    pickers.permission.element,
  );
  // A list opens below the toolbar and the card makes room for it, so the
  // window grows to fit it instead of clipping it.
  const fitList = () => {
    const open = pickers.all.find((p) => p.isOpen);
    if (!open) toolbar.style.marginBottom = "";
    else {
      const menu = open.element.querySelector(".gl-picker-menu");
      menu.style.left = `${open.element.offsetLeft}px`;
      toolbar.style.marginBottom = `${menu.offsetHeight + 4}px`;
    }
    on.resize?.();
  };
  const View = doc.defaultView;
  if (View?.MutationObserver)
    new View.MutationObserver(fitList).observe(toolbar, {
      attributes: true,
      attributeFilter: ["data-open"],
      subtree: true,
    });
  const notice = el("div", "mini-notice", { role: "alert" });
  notice.hidden = true;
  const quick = el("div", "mini-quick", {
    role: "group",
    "aria-label": t("mini.quick"),
  });
  const offers = el("div", "mini-offers");
  card.append(pause, entries, row, toolbar, notice, quick, offers);
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
  add.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const chosen = [...file.files];
    file.value = "";
    for (const f of chosen) await on.attach(f);
  });
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
    const label =
      entry.type === "image"
        ? t("mini.image")
        : entry.type === "file"
          ? entry.name
          : t("mini.text");
    if (entry.type === "image") {
      if (entry.pending) {
        chip.append(el("span", "mini-thumb mini-thumb-pending"));
      } else if (entry.thumb) {
        // The thumbnail opens the whole picture.
        const open = el("button", "mini-open", {
          type: "button",
          title: t("mini.open-image"),
          "aria-label": t("mini.open-image"),
        });
        open.append(el("img", "mini-thumb", { alt: "", src: entry.thumb }));
        open.addEventListener("click", () => on.openImage(entry.id));
        chip.append(open);
      }
      const name = el("span", "mini-entry-label");
      name.textContent = label;
      chip.append(name);
      if (entry.tag === "frame") {
        const tag = el("span", "mini-tag");
        tag.textContent = tp("tag.frame");
        chip.append(tag);
      }
    } else if (entry.type === "file") {
      const name = el("span", "mini-entry-label", { title: entry.name });
      name.textContent = entry.name;
      chip.append(name);
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
    pickers,
    /** The file chooser, for the + button and for tests. */
    file,
    add,
    fitList,
    dispose: () => controller.abort(),
    update(view) {
      pause.hidden = !view.pause;
      pause.textContent = view.pause ? tp("mini.pause") : "";
      entries.replaceChildren(...view.entries.map(entryChip));
      pickers.apply(view.selection);
      pickers.setDisabled(!view.selection || view.selecting);
      pickers.model.trigger.setAttribute("aria-busy", String(!!view.selecting));
      notice.hidden = !view.notice;
      notice.textContent = view.notice ? tc(`error-${view.notice}`) : "";
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
      // Text typed before more picks joined the box comes back with the new page.
      if (input.value !== view.text && (view.text === "" || input.value === ""))
        input.value = view.text;
    },
  };
}
