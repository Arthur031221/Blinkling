/** What the mini composer is and does (M6, N1.3, N2.5), with no window in it:
 * the picks as chips, the one highlighted ask that Enter sends, the growth
 * into the full composer, and the one-click pause. The window only draws
 * state() and forwards clicks and keys. */
import { pickLocale } from "../shared/i18n.mjs";
import { CHIPS, defaultChip, promptFor } from "../pick/ask.mjs";
import { pickText } from "../pick/strings.mjs";
import { miniText } from "./strings.mjs";

export const LONG_MESSAGE = 120;
const MAX_ATTACHMENTS = 8;
const WORDS = 2;
const WORD_CHARS = 18;

const snippet = (text) => {
  const words = text.trim().split(/\s+/).slice(0, WORDS).join(" ");
  return words.length > WORD_CHARS ? `${words.slice(0, WORD_CHARS)}…` : words;
};

export function createMini({
  locale,
  send,
  grow,
  discard,
  restoreFocus,
  close,
  autoExplain,
  host,
  newId = () => crypto.randomUUID(),
}) {
  const code = pickLocale(locale);
  const t = miniText(locale);
  const p = pickText(locale);
  const listeners = new Set();
  let picks = [],
    offers = [],
    draft = "",
    open = false,
    error = "";

  const last = () => picks.at(-1);
  const highlighted = () => (last() ? defaultChip(last(), code) : null);
  const state = () => ({
    open,
    picks: picks.map((x) => ({
      id: x.id,
      kind: x.kind,
      image: x.image,
      textChip: x.text
        ? t("textChip", { words: snippet(x.text), count: x.text.length })
        : null,
    })),
    chips: picks.length
      ? CHIPS.map((id) => ({ id, label: t(id), highlighted: id === highlighted() }))
      : [],
    draft,
    pause: open && autoExplain.enabled(),
    offers: offers.map(({ id }) =>
      id === "pdf"
        ? { id, label: p("pdfOffer"), action: p("pdfOpen"), dismiss: p("dismiss") }
        : { id, label: p("translatePage"), action: p("translatePage"), dismiss: p("dismiss") },
    ),
    error,
  });
  const notify = () => {
    const s = state();
    for (const fn of listeners) fn(s);
  };

  function attachments() {
    const list = picks.map((x, i) => ({
      id: newId(),
      name: `Pick ${i + 1}.png`,
      mediaType: "image/png",
      data: x.image.data,
    }));
    const text = picks.map((x) => x.text).filter(Boolean).join("\n\n");
    if (text)
      list.push({
        id: newId(),
        name: "Picked text.txt",
        mediaType: "text/plain",
        data: Buffer.from(text, "utf8").toString("base64"),
      });
    return list.slice(0, MAX_ATTACHMENTS);
  }

  function finish(restore = true) {
    open = false;
    picks = [];
    offers = [];
    draft = "";
    error = "";
    close();
    if (restore) restoreFocus();
    notify();
  }

  async function submit(text) {
    const turn = { id: newId(), text, attachments: attachments(), source: "quick-ask" };
    if (!turn.text.trim() && !turn.attachments.length) return;
    try {
      await send(turn);
    } catch (e) {
      error = e?.message ?? String(e);
      notify();
      return;
    }
    finish();
  }

  function growToComposer() {
    const seed = { draft, picks: picks.map((x) => structuredClone(x)) };
    finish(false);
    grow(seed);
  }

  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    open(next, nextOffers = []) {
      picks = next.map((x) => structuredClone(x));
      offers = nextOffers.map((o) => ({ ...o }));
      draft = "";
      error = "";
      open = true;
      notify();
    },
    update(next) {
      picks = next.map((x) => structuredClone(x));
      notify();
    },
    input(text) {
      draft = String(text);
      if (open && draft.length > LONG_MESSAGE) return growToComposer();
      notify();
    },
    async key({ key, shiftKey = false }) {
      if (!open) return;
      if (key === "Escape") {
        discard();
        return finish();
      }
      if (key !== "Enter") return;
      if (shiftKey) return growToComposer();
      if (draft.trim()) return submit(draft);
      if (picks.length) return submit(promptFor(highlighted(), last(), code));
    },
    async chip(id) {
      if (!open || !CHIPS.includes(id) || !picks.length) return;
      return submit(promptFor(id, last(), code));
    },
    remove(id) {
      picks = picks.filter((x) => x.id !== id);
      if (!picks.length && !autoExplain.enabled()) {
        discard();
        return finish();
      }
      notify();
    },
    pauseAuto() {
      autoExplain.pause();
      notify();
    },
    async offer(id) {
      if (!offers.some((o) => o.id === id)) return;
      offers = offers.filter((o) => o.id !== id);
      notify();
      if (id === "translate-page") await host.translatePage();
      else if (id === "pdf") await host.openPdfReader();
    },
    dismissOffer(id) {
      offers = offers.filter((o) => o.id !== id);
      notify();
    },
  };
}
