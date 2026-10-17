import { attachNudge } from "../shared/nudge.mjs";
import { readAttachment } from "./index.mjs";
import { documentLocale, translator } from "../shared/i18n.mjs";
import { strings } from "./strings.mjs";
import { createSelectionPickers } from "./selection.mjs";
import { mountThinking } from "./thinking.mjs";
import { wantedHeight } from "./size.mjs";
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
    onNudge = () => {},
    nudgeNow = () => ({ x: 0, y: 0 }),
    onClose = () => {},
    onTyping = () => {},
    onHold = () => {},
    onSize = () => {},
    onAction = () => {},
    onQuick = () => {},
    onChat = () => {},
    onReference = () => {},
    copy,
    openLink,
    openImage,
    locale = documentLocale(host.ownerDocument),
  } = {},
) {
  const doc = host.ownerDocument;
  const tr = translator(strings, locale);
  /** A picture in the card opens in the viewer, where it can be zoomed. */
  const zoomable = (img, image) => {
    if (!img || !openImage) return img;
    const source = image.source ?? {
      media_type: image.mediaType,
      data: image.data,
    };
    img.classList.add("is-zoomable");
    listen(img, "click", () =>
      openImage({
        mediaType: source.media_type,
        data: source.data,
        name: image.name ?? "",
      }),
    );
    return img;
  };
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
  // One tab for each Claude Code session Blink holds a chat with; only there
  // when there is more than one to choose from.
  const tabs = node("div", "gl-chat-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", tr("chats"));
  tabs.hidden = true;
  let tabSignature = "";
  const showTabs = (state) => {
    const wanted = state.chats.length > 1 ? state.chats : [];
    const signature = JSON.stringify([wanted, state.chatKey]);
    if (signature === tabSignature) return;
    tabSignature = signature;
    tabs.hidden = !wanted.length;
    tabs.replaceChildren(
      ...wanted.map((chat) => {
        const tab = node("button", "gl-chat-tab", chat.label);
        tab.type = "button";
        tab.setAttribute("role", "tab");
        tab.dataset.chat = chat.key;
        tab.dataset.live = String(chat.live);
        tab.setAttribute("aria-selected", String(chat.key === state.chatKey));
        tab.title = chat.label;
        tab.addEventListener("click", () => {
          if (chat.key !== state.chatKey) onChat(chat.key);
        });
        return tab;
      }),
    );
  };
  const history = node("div", "gl-chat-history");
  history.setAttribute("role", "log");
  history.setAttribute("aria-label", tr("history"));
  history.setAttribute("aria-live", "polite");
  const quick = node("div", "gl-quick-asks");
  quick.setAttribute("aria-label", tr("quick-label"));
  // What a capture adds to the question: why Auto explain is paused, and the
  // one-time offer to open a PDF.
  const quickLine = node("div", "gl-quick-line"),
    quickPause = node("span", "gl-quick-pause"),
    quickOffer = node("button", "gl-action-chip");
  quickOffer.type = "button";
  quickLine.hidden = quickOffer.hidden = true;
  quickLine.append(quickPause, quickOffer);
  // The quick question a capture opened: which chip Enter sends, and whether
  // the card has to tell main how it ended.
  let asking = { active: false, defaultId: null, offer: null };
  const attachments = node("div", "gl-attachments");
  attachments.setAttribute("aria-label", tr("attachments"));
  attachments.hidden = true;
  const form = node("form", "gl-composer"),
    text = node("textarea", "gl-input");
  text.setAttribute("aria-label", tr("input"));
  text.placeholder = tr("placeholder");
  // Two lines, one on a short display where the card has no room to spare.
  text.rows = globalThis.matchMedia?.("(max-height: 460px)").matches ? 1 : 2;
  const controller = new AbortController(),
    signal = controller.signal;
  const { model, effort, permission, ...pickers } = createSelectionPickers(
    doc,
    { tr, signal, models, efforts, onChoose: (wanted) => choose(wanted) },
  );
  const listen = (n, type, fn) => n.addEventListener(type, fn, { signal });
  attachNudge(header, { send: onNudge, current: nudgeNow, signal });
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
  card.append(
    header,
    tabs,
    history,
    guide,
    notice,
    quick,
    quickLine,
    form,
    error,
  );
  host.append(card);
  let pinned = false,
    visible = true,
    following = true,
    disposed = false;
  const messageNodes = new Map(),
    attachmentNodes = new Map();
  let attachmentGroups = new Map();
  // The composer carries a code; anything without a known one reads generically.
  const known = (code) => strings.en[`error-${code}`] !== undefined;
  const fail = (e) => composer.error(known(e?.code) ? e.code : "generic");
  let pointer = false;
  listen(card, "mouseenter", () => {
    pointer = true;
    hold();
  });
  listen(card, "mouseleave", () => {
    pointer = false;
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
        endQuick();
      })
      .catch((e) => {
        if (!composer.state().error) fail(e);
      });
  const endQuick = () => {
    if (!asking.active) return;
    asking = { active: false, defaultId: null, offer: null };
    paintQuick();
    onQuick({ type: "end" });
  };
  const quickIds = ["what", "translate", "keypoints"];
  for (const [i, key] of quickAsks.entries()) {
    const question = tr(key);
    const b = node("button", "gl-quick-chip", question);
    b.type = "button";
    b.dataset.chip = quickIds[i];
    // A chip sends exactly the words on it.
    listen(b, "click", () => submit(question, "quick-ask"));
    quick.append(b);
  }
  listen(quickOffer, "click", () => {
    if (asking.offer) onQuick({ type: "offer", id: asking.offer.id });
  });
  const paintQuick = () => {
    for (const b of quick.children)
      b.dataset.default = String(b.dataset.chip === asking.defaultId);
    quickPause.textContent = asking.pause ?? "";
    quickPause.hidden = !asking.pause;
    quickOffer.textContent = asking.offer?.text ?? "";
    quickOffer.hidden = !asking.offer;
    quickLine.hidden = quickPause.hidden && quickOffer.hidden;
    const images = composer
      .state()
      .attachments.some((a) => a.mediaType.startsWith("image/"));
    quick.hidden = !(asking.active || images);
  };
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
      // Nothing typed: Enter asks the highlighted quick question.
      const state = composer.state();
      const chip =
        !text.value.trim() && state.attachments.length
          ? quick.querySelector('[data-default="true"]')
          : null;
      if (asking.active && chip && !state.busy) chip.click();
      else submit();
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
    paintQuick();
    error.textContent = state.error
      ? tr(`error-${known(state.error) ? state.error : "generic"}`)
      : "";
    error.hidden = !state.error;
    // The tiles of one page are one chip; each tile is still its own picture.
    const groups = new Map();
    for (const a of state.attachments) {
      const key = a.page?.id ?? a.id;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    attachmentGroups = groups;
    for (const [key, n] of attachmentNodes)
      if (!groups.has(key)) {
        n.remove();
        attachmentNodes.delete(key);
      }
    for (const [key, items] of groups) {
      const a = items[0],
        whole = Boolean(a.page),
        label = whole
          ? tr("page-chip", {
              count: Math.max(a.page.total ?? 0, items.length),
            })
          : a.name;
      const existing = attachmentNodes.get(key);
      if (existing) {
        existing.title = label;
        existing.querySelector(".gl-attachment-name").textContent = label;
        continue;
      }
      const chip = node("div", "gl-attachment-chip"),
        img = a.mediaType.startsWith("image/")
          ? zoomable(renderImage(doc, a), a)
          : node("span", "gl-file-icon", "▤"),
        name = node("span", "gl-attachment-name", label),
        remove = button(tr("remove", { name: label }), "×");
      chip.title = label;
      if (img) chip.append(img);
      chip.append(name, remove);
      listen(remove, "click", () => {
        for (const { id } of attachmentGroups.get(key) ?? []) {
          composer.remove(id);
          if (asking.active) onQuick({ type: "remove", id });
        }
      });
      attachments.append(chip);
      attachmentNodes.set(key, chip);
    }
    attachments.hidden = !state.attachments.length;
    if (chips !== Boolean(state.attachments.length)) {
      chips = Boolean(state.attachments.length);
      hold();
    }
  });
  const unMessages = store.subscribe((state) => {
    showTabs(state);
    // A terminal's chat is answered by that session: it has no model to pick.
    card.dataset.channel = String(state.channel);
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
            const img = zoomable(renderImage(doc, b), b);
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
  // The window is as tall as the card's content asks for, so an empty card is
  // short and grows with what it holds. Measured once a frame at most.
  const cleanups = [];
  let measured = 0,
    sizing = 0;
  const measure = () => {
    sizing = 0;
    if (disposed || !visible) return;
    // The paper's top fade ends where the message list begins.
    const fade = `${history.offsetTop}px`;
    if (card.style.getPropertyValue("--gl-fade") !== fade)
      card.style.setProperty("--gl-fade", fade);
    const wanted = wantedHeight({
      card: Math.max(card.offsetHeight, card.scrollHeight),
      historyShown: history.clientHeight,
      historyContent: history.scrollHeight,
    });
    if (wanted && wanted !== measured) onSize((measured = wanted));
  };
  const resize = () => {
    if (!sizing) sizing = doc.defaultView.requestAnimationFrame(measure);
  };
  const win = doc.defaultView;
  if (win?.MutationObserver) {
    const watch = new win.MutationObserver(resize);
    watch.observe(card, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    cleanups.push(() => watch.disconnect());
  }
  if (win?.ResizeObserver) {
    // The history loses room when the composer grows (a picture joins it) and
    // when the window is resized. A reader at the newest message stays there;
    // one who scrolled up is left where they are.
    const watch = new win.ResizeObserver(() => {
      resize();
      if (following && visible) history.scrollTop = history.scrollHeight;
    });
    watch.observe(card);
    watch.observe(history);
    cleanups.push(() => watch.disconnect());
  }
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
      const wasOpen = visible;
      visible = true;
      card.hidden = false;
      card.dataset.open = "true";
      if (messageId)
        messageNodes
          .get(messageId)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      else if (!wasOpen) {
        // Every opening continues the history: the newest message, right
        // above the composer. A refocus of a card already open leaves the
        // reader where they are.
        following = true;
        history.scrollTop = history.scrollHeight;
      }
      resize();
      text.focus({ preventScroll: true });
      // A draft left behind by Esc still counts once the card is back.
      onTyping(Boolean(text.value));
    },
    /** `quiet`: the shell closed the card and already knows. */
    close(quiet = false) {
      endQuick();
      visible = false;
      card.dataset.open = "false";
      card.hidden = true;
      onTyping(false);
      if (!quiet) onClose();
    },
    /** Back on the newest message, as after the image viewer closed. */
    toNewest() {
      following = true;
      history.scrollTop = history.scrollHeight;
    },
    /** Escape closes the topmost thing: an open list first, then the card. */
    escape() {
      if (pickers.dismiss()) return true;
      if (!visible) return false;
      view.close();
      return true;
    },
    capture(capture) {
      composer.capture(capture);
      view.open();
    },
    /** A capture opened or changed the quick question (see pick/quick.mjs). */
    quick(event) {
      asking = event.active
        ? {
            active: true,
            defaultId: event.defaultId,
            pause: event.pause,
            offer: event.offer,
          }
        : { active: false, defaultId: null, offer: null };
      paintQuick();
      if (event.active && event.notice)
        composer.error(known(event.notice) ? event.notice : "generic");
    },
    /** A guide event: its steps appear in the card. */
    guide(event) {
      guidePanel.update(event);
      // A tour shows the step and its buttons and nothing else, so the card is
      // short enough to stay clear of what the step points at.
      card.classList.toggle(
        "gl-touring",
        event.phase !== "dismissed" && event.phase !== "error",
      );
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
    /** Carry the pin over to a card built again in another language. */
    setPinned(value) {
      pinned = Boolean(value);
      pin.setAttribute("aria-pressed", String(pinned));
    },
    isPinned: () => pinned,
    isOpen: () => visible,
    dispose() {
      disposed = true;
      for (const stop of cleanups) stop();
      controller.abort();
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
