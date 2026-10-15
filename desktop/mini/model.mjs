import { randomUUID } from "node:crypto";
import { askModel } from "../pick/ask.mjs";
import { chipText } from "../pick/taken.mjs";
import {
  attachmentBytes,
  attachmentLimits,
  failure,
} from "../composer/index.mjs";

/** A message this long, or this many lines, no longer fits a mini box: it moves
 * to the full composer with everything attached (M5, N1.5). */
export const LONG_CHARS = 280;
export const LONG_LINES = 6;

const decode = (a) => Buffer.from(a.data, "base64").toString("utf8");
const isImage = (e) =>
  e.pending || e.attachment?.mediaType?.startsWith("image/");
/** A file added with the + button: shown by its name, never as pasted text. */
const isFile = (e) => e.kind === "file";

/** The state and rules of the mini composer, without any window. The renderer
 * shows `view()` and forwards key presses and clicks to the methods.
 *
 * entries: [{id, kind, attachment, taken?, thumb?, pending?}] one per chip. A
 *   pending entry is a pick whose pixels are still being taken: it shows at once,
 *   `fill` completes it, `remove` drops it, and a send waits for either.
 * text: what was already typed when more picks join an open box.
 * host: send(turn), openComposer(seed), close(reason) and optionally
 *   pauseAuto/resumeAuto, translatePage, openPdfReader. */
export function createMini({
  locale,
  entries,
  text: startText = "",
  host,
  autoExplain = () => false,
  once,
  uuid = randomUUID,
}) {
  let list = [...entries];
  let text = startText;
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
  const attachments = () =>
    list.filter((e) => !e.pending).map((e) => e.attachment);

  let waiting = [];
  const settle = () => {
    if (list.some((e) => e.pending)) return;
    for (const resolve of waiting.splice(0)) resolve();
  };
  const pixels = () =>
    list.some((e) => e.pending)
      ? new Promise((resolve) => waiting.push(resolve))
      : Promise.resolve();

  function close(reason) {
    if (closed) return;
    closed = true;
    list = list.filter((e) => !e.pending);
    settle();
    if (paused) host.resumeAuto?.();
    host.close(reason);
  }

  async function sendTurn(message, source) {
    await pixels();
    if (closed) return { type: "closed" };
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
    /** What the box holds now, so more picks can join it instead of replacing it. */
    snapshot: () => ({ entries: list, text }),
    view() {
      const model = ask();
      return {
        entries: list.map((e) => ({
          id: e.id,
          type: isImage(e) ? "image" : isFile(e) ? "file" : "text",
          kind: e.kind,
          thumb: e.thumb,
          ...(e.pending ? { pending: true } : {}),
          ...(isFile(e) ? { name: e.attachment.name } : {}),
          ...(isImage(e) || isFile(e)
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
    /** A file or image the user added with +, already checked as an attachment.
     * It counts against the same limits as the full composer. */
    add({ id, attachment }) {
      if (closed) return;
      if (list.length >= attachmentLimits.count)
        throw failure("too-many-files");
      const total = list.reduce(
        (sum, e) => sum + (e.attachment ? attachmentBytes(e.attachment) : 0),
        attachmentBytes(attachment),
      );
      if (total > attachmentLimits.totalBytes) throw failure("total-too-large");
      list = [
        ...list,
        {
          id,
          kind: attachment.mediaType.startsWith("image/") ? "image" : "file",
          attachment,
        },
      ];
    },
    remove(id) {
      list = list.filter((e) => e.id !== id);
      settle();
    },
    fill(entry) {
      list = list.map((e) => (e.id === entry.id ? entry : e));
      settle();
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
