import { readAttachment } from "./index.mjs";
import { documentLocale, translator } from "../shared/i18n.mjs";
import { strings } from "./strings.mjs";
import { createSelectionPickers } from "./selection.mjs";
import { mountThinking } from "./thinking.mjs";
import { mountGuidePanel } from "./guide-panel.mjs";
import {
  renderMarkdown,
  renderImage,
  renderDocument,
} from "../messages/render.mjs";
const quickAsks = Object.freeze([
  "quick-what",
  "quick-translate",
  "quick-summary",
]);
// The dot only exists for trouble; these states are the normal ones.
const healthy = new Set(["starting", "connected"]);
const statusKey = (status) =>
  ({ retrying: "status-retrying", blocked: "status-blocked" })[status] ??
  "status-disconnected";

export function mountComposer(
  host,
  {
    composer,
    store,
    models,
    efforts,
    onPin = () => {},
    onClose = () => {},
    onTyping = () => {},
    onHold = () => {},
    onAction = () => {},
    onReference = () => {},
    copy,
    openLink,
    locale = documentLocale(host.ownerDocument),
  } = {},
) {
  const doc = host.ownerDocument;
  const tr = translator(strings, locale);
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
  card.setAttribute("aria-label", tr("card"));
  const header = node("header", "gl-card-header"),
    brand = node("span", "gl-brand", "Blink"),
    dot = node("span", "gl-status-dot"),
    pin = button(tr("pin"), ""),
    close = button(tr("close"), "×");
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
  // Nothing to report while the connection is fine (N3.11).
  dot.setAttribute("role", "status");
  dot.hidden = true;
  pin.setAttribute("aria-pressed", "false");
  header.append(brand, dot, pin, close);
  const history = node("div", "gl-chat-history");
  history.setAttribute("role", "log");
  history.setAttribute("aria-label", tr("history"));
  history.setAttribute("aria-live", "polite");
  const quick = node("div", "gl-quick-asks");
  quick.setAttribute("aria-label", tr("quick-label"));
  const attachments = node("div", "gl-attachments");
  attachments.setAttribute("aria-label", tr("attachments"));
  attachments.hidden = true;
  const form = node("form", "gl-composer"),
    text = node("textarea", "gl-input");
  text.setAttribute("aria-label", tr("input"));
  text.placeholder = tr("placeholder");
  text.rows = 2;
  const controller = new AbortController(),
    signal = controller.signal;
  const { model, effort, permission, ...pickers } = createSelectionPickers(
    doc,
    { tr, signal, models, efforts, onChoose: (wanted) => choose(wanted) },
  );
  const listen = (n, type, fn) => n.addEventListener(type, fn, { signal });
  const toolbar = node("div", "gl-composer-toolbar"),
    add = button(tr("add"), "+"),
    file = node("input"),
    separator = node("span", "gl-picker-dot", "·"),
    send = button(tr("send"), "↑"),
    stop = button(tr("stop"), "■");
  file.type = "file";
  file.multiple = true;
  file.accept =
    "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.txt";
  file.hidden = true;
  toolbar.append(
    add,
    file,
    model.element,
    separator,
    effort.element,
    separator.cloneNode(true),
    permission.element,
    send,
    stop,
  );
  form.append(attachments, text, toolbar);
  const error = node("div", "gl-composer-error");
  error.setAttribute("role", "alert");
  error.hidden = true;
  // In flow between the history and the form: a notice pushes the history up
  // rather than floating over the toolbar.
  const notice = node("section", "gl-notice");
  notice.hidden = true;
  notice.setAttribute("role", "status");
  // The guide's steps and buttons live in the card too: one surface says
  // everything Blink says.
  const guide = node("section", "gl-guide");
  guide.hidden = true;
  const guidePanel = mountGuidePanel({ host: guide, tr, onAction });
  const thinking = mountThinking(history, { label: tr("working") });
  card.append(header, history, guide, notice, quick, form, error);
  host.append(card);
  let pinned = false,
    visible = true,
    following = true,
    disposed = false;
  const messageNodes = new Map(),
    attachmentNodes = new Map();
  // The composer carries a code; anything without a known one reads generically.
  const known = (code) => strings.en[`error-${code}`] !== undefined;
  const fail = (e) => composer.error(known(e?.code) ? e.code : "generic");
  let pointer = false;
  listen(card, "mouseenter", () => {
    pointer = true;
    store.hover(true, "card");
    hold();
  });
  listen(card, "mouseleave", () => {
    pointer = false;
    store.hover(false, "card");
    hold();
  });
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
  for (const key of quickAsks) {
    const question = tr(key);
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
  // Work in progress that the card must not close over: a pending chip, or a
  // file chooser the user has not answered yet.
  let dialogOpen = false,
    chips = false;
  const hold = () => onHold({ chips, dialog: dialogOpen, pointer });
  const closeDialog = () => {
    if (!dialogOpen) return;
    dialogOpen = false;
    hold();
  };
  listen(add, "click", () => {
    dialogOpen = true;
    hold();
    file.click();
  });
  listen(file, "cancel", closeDialog);
  listen(file, "change", async () => {
    closeDialog();
    await ingest([...file.files]);
    file.value = "";
    hold();
  });
  listen(text, "input", () => {
    composer.draft(text.value);
    onTyping(Boolean(text.value));
    text.style.height = "auto";
    text.style.height = `${Math.min(160, Math.max(44, text.scrollHeight))}px`;
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
  const choose = (wanted) => composer.select(wanted).catch(() => {});
  listen(pin, "click", () => {
    pinned = !pinned;
    pin.setAttribute("aria-pressed", String(pinned));
    // Unpinning only says so. Whether the card then closes is the shell's call,
    // which knows where the pointer and the keyboard focus are.
    onPin(pinned);
  });
  listen(close, "click", () => {
    view.close();
  });
  listen(history, "scroll", () => {
    following =
      history.scrollHeight - history.clientHeight - history.scrollTop < 32;
  });
  const unComposer = composer.subscribe((state) => {
    if (text.value !== state.draft) text.value = state.draft;
    hold();
    pickers.apply(state.selection);
    const locked = state.busy || state.selecting || !state.selection;
    pickers.setDisabled(locked);
    model.trigger.setAttribute("aria-busy", String(state.selecting));
    send.hidden = state.busy;
    send.disabled =
      state.selecting || (!state.draft.trim() && !state.attachments.length);
    stop.hidden = !state.busy;
    stop.disabled = state.stopping;
    for (const b of quick.children) b.disabled = state.busy || state.selecting;
    quick.hidden = !state.attachments.some((a) =>
      a.mediaType.startsWith("image/"),
    );
    error.textContent = state.error
      ? tr(`error-${known(state.error) ? state.error : "generic"}`)
      : "";
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
          remove = button(tr("remove", { name: a.name }), "×");
        chip.title = a.name;
        if (img) chip.append(img);
        chip.append(name, remove);
        listen(remove, "click", () => composer.remove(a.id));
        attachments.append(chip);
        attachmentNodes.set(a.id, chip);
      }
    attachments.hidden = !state.attachments.length;
    if (chips !== Boolean(state.attachments.length)) {
      chips = Boolean(state.attachments.length);
      hold();
    }
  });
  const unMessages = store.subscribe((state) => {
    dot.hidden = healthy.has(state.status);
    dot.dataset.state = state.status;
    dot.setAttribute("aria-label", tr(statusKey(state.status)));
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
        history.insertBefore(n, thinking.element);
        messageNodes.set(message.id, n);
      }
      const signature = JSON.stringify([
        message.content,
        message.failure,
        message.offer,
      ]);
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
        // What Blink offers to do about a problem or a finished guide.
        const actions = message.failure?.actions ?? [];
        if (message.offer)
          actions.push({
            id: message.offer.action,
            label: message.offer.label,
          });
        if (actions.length) {
          const row = node("div", "gl-message-actions");
          for (const a of actions) {
            const b = node("button", "gl-action-chip", a.label);
            b.type = "button";
            listen(b, "click", () => onAction(a.id));
            row.append(b);
          }
          n.append(row);
        }
        n.dataset.signature = signature;
      }
    }
    if (state.working) thinking.start({ seeing: state.seeing });
    else thinking.stop();
    if (following) history.scrollTop = history.scrollHeight;
  });
  // A reference badge in an answer lights its mark on the page.
  listen(history, "mouseover", (e) => {
    const ref = e.target.closest?.(".gl-ref")?.dataset.ref;
    if (ref) onReference({ ref });
  });
  listen(history, "mouseout", (e) => {
    if (e.target.closest?.(".gl-ref")) onReference({ ref: null });
  });
  const view = {
    element: card,
    notice,
    open(messageId) {
      visible = true;
      card.hidden = false;
      card.dataset.open = "true";
      if (messageId)
        messageNodes
          .get(messageId)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      else {
        // Every opening continues the history: the newest message, right
        // above the composer.
        following = true;
        history.scrollTop = history.scrollHeight;
      }
      text.focus({ preventScroll: true });
      // A draft left behind by Esc still counts once the card is back.
      onTyping(Boolean(text.value));
    },
    close() {
      visible = false;
      card.dataset.open = "false";
      card.hidden = true;
      onTyping(false);
      onClose();
    },
    /** Escape closes the topmost thing: an open list first, then the card. */
    escape() {
      if (pickers.dismiss()) return true;
      if (!visible) return false;
      view.close();
      return true;
    },
    quiet() {
      if (!pinned && !dialogOpen && !pointer && !doc.hasFocus()) view.close();
    },
    capture(capture) {
      composer.capture(capture);
      view.open();
    },
    /** A guide event: its steps appear in the card. */
    guide(event) {
      guidePanel.update(event);
      notice.hidden = true;
    },
    /** Show the reference badge a mark on the page cites. */
    reveal(ref) {
      const badge = [...history.querySelectorAll(".gl-ref")].find(
        (b) => b.dataset.ref === ref,
      );
      if (!badge) return false;
      badge.scrollIntoView({ block: "center", behavior: "smooth" });
      badge.dataset.flash = "true";
      badge.addEventListener("animationend", () => delete badge.dataset.flash, {
        once: true,
      });
      return true;
    },
    isPinned: () => pinned,
    isOpen: () => visible,
    dispose() {
      disposed = true;
      controller.abort();
      store.hover(false, "card");
      unComposer();
      unMessages();
      thinking.dispose();
      card.remove();
    },
    async files(files) {
      if (!disposed) await ingest(files);
    },
  };
  card.dataset.open = "true";
  return view;
}
