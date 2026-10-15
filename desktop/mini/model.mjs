import { randomUUID } from "node:crypto";
import { askModel } from "../pick/ask.mjs";
import { chipText } from "../pick/taken.mjs";

/** A message this long, or this many lines, no longer fits a mini box: it moves
 * to the full composer with everything attached (M5, N1.5). */
export const LONG_CHARS = 280;
export const LONG_LINES = 6;

const decode = (a) => Buffer.from(a.data, "base64").toString("utf8");
const isImage = (e) => e.attachment?.mediaType?.startsWith("image/");

/** The state and rules of the mini composer, without any window. The renderer
 * shows `view()` and forwards key presses and clicks to the methods.
 *
 * entries: [{id, kind, attachment, taken?, thumb?}] one per chip.
 * host: send(turn), openComposer(seed), close(reason) and optionally
 *   pauseAuto/resumeAuto, translatePage, openPdfReader. */
export function createMini({
  locale,
  entries,
  host,
  autoExplain = () => false,
  once,
  uuid = randomUUID,
}) {
  let list = [...entries];
  let text = "";
  let closed = false;
  const paused = autoExplain();
  if (paused) host.pauseAuto?.();

  // Offers are decided once, when the mini opens: the PDF one is shown a single time.
  const offers = [];
  const page = entries.find(
    (e) =>
      e.taken?.kind === "page" &&
      e.taken.browser &&
      (e.taken.text ?? "").trim(),
  );
  if (page && host.translatePage)
    offers.push({ id: "translate-page", entryId: page.id });
  const blank = entries.find(
    (e) =>
      e.taken?.window?.pdf &&
      !(e.taken.text ?? "").trim() &&
      e.taken.kind !== "text",
  );
  if (blank && host.openPdfReader && once?.take("pdf-reader-offer"))
    offers.push({ id: "pdf-reader", entryId: blank.id });

  const ask = () =>
    askModel({
      items: list.map((e) => e.taken ?? { kind: e.kind }),
      locale,
    });
  const attachments = () => list.map((e) => e.attachment);

  function close(reason) {
    if (closed) return;
    closed = true;
    if (paused) host.resumeAuto?.();
    host.close(reason);
  }

  async function sendTurn(message, source) {
    const turn = {
      id: uuid(),
      text: message,
      attachments: attachments(),
      source,
    };
    await host.send(turn);
    close("sent");
    return { type: "sent", turn };
  }

  function grow() {
    host.openComposer({ text, attachments: attachments() });
    close("grew");
  }

  return {
    view() {
      const model = ask();
      return {
        entries: list.map((e) => ({
          id: e.id,
          type: isImage(e) ? "image" : "text",
          kind: e.kind,
          thumb: e.thumb,
          ...(isImage(e)
            ? {}
            : chipText(e.taken?.text ?? decode(e.attachment))),
          tag: e.taken?.tag ?? null,
        })),
        chips: model.chips,
        defaultId: model.defaultId,
        placeholder: model.placeholder,
        text,
        pause: paused,
        offers: offers.filter((o) => list.some((e) => e.id === o.entryId)),
      };
    },
    setText(value) {
      if (closed) return;
      text = value;
      if (text.length > LONG_CHARS || text.split("\n").length >= LONG_LINES)
        grow();
    },
    remove(id) {
      list = list.filter((e) => e.id !== id);
    },
    async submit({ shift = false } = {}) {
      if (closed) return { type: "closed" };
      if (shift) {
        this.setText(`${text}\n`);
        return { type: "newline" };
      }
      if (text.trim()) return sendTurn(text, "composer");
      const model = ask();
      if (!model.defaultId) return { type: "empty" };
      return sendTurn(
        model.chips.find((c) => c.id === model.defaultId).prompt,
        "quick-ask",
      );
    },
    async chip(id) {
      if (closed) return { type: "closed" };
      const chip = ask().chips.find((c) => c.id === id);
      return chip ? sendTurn(chip.prompt, "quick-ask") : { type: "empty" };
    },
    async offer(id) {
      const offer = offers.find((o) => o.id === id);
      if (closed || !offer) return;
      close("offer");
      if (id === "translate-page") await host.translatePage();
      else await host.openPdfReader();
    },
    escape: () => close("escape"),
    dispose: () => close("dispose"),
  };
}
