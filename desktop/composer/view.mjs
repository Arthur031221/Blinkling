import { readAttachment } from "./index.mjs";
import {
  renderMarkdown,
  renderImage,
  renderDocument,
} from "../messages/render.mjs";
export const quickAsks = Object.freeze(["這是什麼", "翻譯", "重點"]);
const defaultModels = [
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];
const defaultEfforts = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

export function mountComposer(
  host,
  {
    composer,
    store,
    models = defaultModels,
    efforts = defaultEfforts,
    onPin = () => {},
    onClose = () => {},
    onTyping = () => {},
    copy,
    openLink,
  } = {},
) {
  const doc = host.ownerDocument;
  const node = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  const button = (label, icon) => {
    const n = node("button", "gl-icon-button", icon);
    n.type = "button";
    n.setAttribute("aria-label", label);
    n.title = label;
    return n;
  };
  const card = node("section", "gl-chat-card");
  card.setAttribute("aria-label", "與 Blink 對話");
  const header = node("header", "gl-card-header"),
    brand = node("span", "gl-brand", "Blink"),
    dot = node("span", "gl-status-dot"),
    pin = button("釘選對話", ""),
    close = button("收起對話", "×");
  const pinSvg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  pinSvg.setAttribute("viewBox", "0 0 24 24");
  pinSvg.setAttribute("width", "18");
  pinSvg.setAttribute("height", "18");
  pinSvg.setAttribute("aria-hidden", "true");
  const pinPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  pinPath.setAttribute("d", "M9 3h6l-1 6 4 4v2h-5v6h-2v-6H6v-2l4-4z");
  pinPath.setAttribute("fill", "none");
  pinPath.setAttribute("stroke", "currentColor");
  pinPath.setAttribute("stroke-width", "1.6");
  pinPath.setAttribute("stroke-linejoin", "round");
  pinSvg.append(pinPath);
  pin.append(pinSvg);
  dot.setAttribute("role", "status");
  dot.setAttribute("aria-label", "正在連線");
  pin.setAttribute("aria-pressed", "false");
  header.append(brand, dot, pin, close);
  const history = node("div", "gl-chat-history");
  history.setAttribute("role", "log");
  history.setAttribute("aria-label", "對話紀錄");
  history.setAttribute("aria-live", "polite");
  const quick = node("div", "gl-quick-asks");
  quick.setAttribute("aria-label", "快速提問");
  const attachments = node("div", "gl-attachments");
  attachments.setAttribute("aria-label", "附件");
  const form = node("form", "gl-composer"),
    text = node("textarea", "gl-input");
  text.setAttribute("aria-label", "輸入問題");
  text.placeholder = "問 Blink…";
  text.rows = 2;
  const toolbar = node("div", "gl-composer-toolbar"),
    add = button("加入附件", "+"),
    file = node("input"),
    model = node("select", "gl-picker"),
    effort = node("select", "gl-picker"),
    separator = node("span", "gl-picker-dot", "·"),
    send = button("傳送", "↑"),
    stop = button("停止回答", "■");
  file.type = "file";
  file.multiple = true;
  file.accept =
    "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.txt";
  file.hidden = true;
  model.setAttribute("aria-label", "模型");
  effort.setAttribute("aria-label", "思考程度");
  for (const [control, label] of [
    [model, "模型"],
    [effort, "思考程度"],
  ]) {
    const placeholder = node("option", null, label);
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.hidden = true;
    control.append(placeholder);
  }
  const options = (select, items) => {
    for (const item of items) {
      const o = node("option", null, item.label);
      o.value = item.id;
      select.append(o);
    }
  };
  options(model, models);
  options(effort, efforts);
  toolbar.append(add, file, model, separator, effort, send, stop);
  form.append(attachments, text, toolbar);
  const error = node("div", "gl-composer-error");
  error.setAttribute("role", "alert");
  error.hidden = true;
  card.append(header, history, quick, form, error);
  host.append(card);
  let pinned = false,
    visible = true,
    following = true,
    lastSelection,
    disposed = false;
  const messageNodes = new Map(),
    attachmentNodes = new Map();
  const controller = new AbortController(),
    signal = controller.signal;
  const listen = (n, type, fn) => n.addEventListener(type, fn, { signal });
  const fail = (e) =>
    composer.error(
      /^[\u4e00-\u9fff]/u.test(e?.message ?? "")
        ? e.message
        : "暫時無法完成，請再試一次",
    );
  listen(card, "mouseenter", () => store.hover(true, "card"));
  listen(card, "mouseleave", () => store.hover(false, "card"));
  const submit = (question = undefined, source = "composer") =>
    composer
      .send(question, source)
      .then((turn) => {
        // Admission may already have delivered the canonical user event. Keep
        // its document/image blocks rather than replacing them with a preview.
        if (!store.snapshot().some((message) => message.id === turn.id))
          store.append({
            id: turn.id,
            role: "user",
            content: [
              ...turn.attachments
                .map((a) => ({ type: "image", ...a }))
                .filter((a) => a.mediaType.startsWith("image/")),
              ...turn.attachments
                .filter((a) => !a.mediaType.startsWith("image/"))
                .map((a) => ({ type: "document", title: a.name })),
              { type: "text", text: turn.text },
            ],
          });
        onTyping(false);
      })
      .catch((e) => {
        if (!composer.state().error) fail(e);
      });
  for (const question of quickAsks) {
    const b = node("button", "gl-quick-chip", question);
    b.type = "button";
    listen(b, "click", () => submit(question, "quick-ask"));
    quick.append(b);
  }
  const ingest = async (files) => {
    try {
      for (const f of files) composer.attach(await readAttachment(f));
      composer.error("");
    } catch (e) {
      fail(e);
    }
  };
  listen(add, "click", () => file.click());
  listen(file, "change", async () => {
    await ingest([...file.files]);
    file.value = "";
  });
  listen(text, "input", () => {
    composer.draft(text.value);
    onTyping(Boolean(text.value));
    text.style.height = "auto";
    text.style.height = `${Math.min(160, Math.max(60, text.scrollHeight))}px`;
  });
  listen(text, "keydown", (e) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault();
      submit();
    }
  });
  listen(form, "submit", (e) => {
    e.preventDefault();
    submit();
  });
  listen(send, "click", () => submit());
  listen(stop, "click", () => composer.stop().catch(() => {}));
  listen(card, "paste", (e) => {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      void ingest(files);
    }
  });
  listen(card, "dragover", (e) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      card.dataset.dragging = "true";
    }
  });
  listen(card, "dragleave", (e) => {
    if (!card.contains(e.relatedTarget)) delete card.dataset.dragging;
  });
  listen(card, "drop", (e) => {
    delete card.dataset.dragging;
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      void ingest([...e.dataTransfer.files]);
    }
  });
  const choose = () => {
    const wanted = { model: model.value, effort: effort.value };
    applySelection(lastSelection);
    composer.select(wanted).catch(() => {});
  };
  listen(model, "change", choose);
  listen(effort, "change", choose);
  listen(pin, "click", () => {
    pinned = !pinned;
    pin.setAttribute("aria-pressed", String(pinned));
    onPin(pinned);
    if (!pinned && !store.state().visible) view.close();
  });
  listen(close, "click", () => {
    view.close();
  });
  listen(history, "scroll", () => {
    following =
      history.scrollHeight - history.clientHeight - history.scrollTop < 32;
  });
  function applySelection(selection) {
    if (!selection) {
      model.value = effort.value = "";
      return;
    }
    for (const [control, value] of [
      [model, selection.model],
      [effort, selection.effort],
    ]) {
      if (![...control.options].some((o) => o.value === value))
        options(control, [
          {
            id: value,
            label:
              control === model
                ? (models.find((m) => value === m.id)?.label ??
                  value.replace(
                    /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-\d{8})?$/,
                    (_match, family, major, minor) =>
                      `${family[0].toUpperCase()}${family.slice(1)} ${major}.${minor}`,
                  ))
                : value,
          },
        ]);
      control.value = value;
    }
  }
  const unComposer = composer.subscribe((state) => {
    if (text.value !== state.draft) text.value = state.draft;
    lastSelection = state.selection;
    applySelection(state.selection);
    model.disabled = effort.disabled =
      state.busy || state.selecting || !state.selection;
    model.setAttribute("aria-busy", String(state.selecting));
    send.hidden = state.busy;
    send.disabled =
      state.selecting || (!state.draft.trim() && !state.attachments.length);
    stop.hidden = !state.busy;
    stop.disabled = state.stopping;
    for (const b of quick.children) b.disabled = state.busy || state.selecting;
    quick.hidden = !state.attachments.some((a) =>
      a.mediaType.startsWith("image/"),
    );
    error.textContent = state.error;
    error.hidden = !state.error;
    const keep = new Set(state.attachments.map((a) => a.id));
    for (const [id, n] of attachmentNodes)
      if (!keep.has(id)) {
        n.remove();
        attachmentNodes.delete(id);
      }
    for (const a of state.attachments)
      if (!attachmentNodes.has(a.id)) {
        const chip = node("div", "gl-attachment-chip"),
          img = a.mediaType.startsWith("image/")
            ? renderImage(doc, a)
            : node("span", "gl-file-icon", "▤"),
          name = node("span", "gl-attachment-name", a.name),
          remove = button(`移除 ${a.name}`, "×");
        if (img) chip.append(img);
        chip.append(name, remove);
        listen(remove, "click", () => composer.remove(a.id));
        attachments.append(chip);
        attachmentNodes.set(a.id, chip);
      }
    attachments.hidden = !state.attachments.length;
  });
  const unMessages = store.subscribe((state) => {
    dot.dataset.state = state.status;
    dot.setAttribute(
      "aria-label",
      {
        starting: "正在連線",
        connected: "已連到你的 Claude Code",
        retrying: "正在重新連線",
        blocked: "等待連線",
      }[state.status] ?? "正在連線",
    );
    const ids = new Set(state.messages.map((m) => m.id));
    for (const [id, n] of messageNodes)
      if (!ids.has(id)) {
        n.remove();
        messageNodes.delete(id);
      }
    for (const message of state.messages) {
      let n = messageNodes.get(message.id);
      if (!n) {
        n = node("article", `gl-chat-message gl-${message.role}`);
        n.dataset.messageId = message.id;
        history.append(n);
        messageNodes.set(message.id, n);
      }
      const signature = JSON.stringify(message.content);
      if (n.dataset.signature !== signature) {
        n.replaceChildren();
        for (const b of message.content) {
          if (b.type === "text")
            n.append(renderMarkdown(doc, b.text, { copy, openLink }));
          if (b.type === "image") {
            const img = renderImage(doc, b);
            if (img) n.append(img);
          }
          if (b.type === "document") n.append(renderDocument(doc, b));
        }
        n.dataset.signature = signature;
      }
    }
    if (following) history.scrollTop = history.scrollHeight;
  });
  const view = {
    element: card,
    open(messageId) {
      visible = true;
      card.hidden = false;
      card.dataset.open = "true";
      if (messageId)
        messageNodes
          .get(messageId)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      text.focus({ preventScroll: true });
    },
    close() {
      visible = false;
      card.dataset.open = "false";
      card.hidden = true;
      onTyping(false);
      onClose();
    },
    quiet() {
      if (!pinned) view.close();
    },
    capture(capture) {
      composer.capture(capture);
      view.open();
    },
    isPinned: () => pinned,
    isOpen: () => visible,
    dispose() {
      disposed = true;
      controller.abort();
      store.hover(false, "card");
      unComposer();
      unMessages();
      card.remove();
    },
    async files(files) {
      if (!disposed) await ingest(files);
    },
  };
  card.dataset.open = "true";
  return view;
}
