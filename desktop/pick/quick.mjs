import { askModel } from "./ask.mjs";
import { t as pickText } from "./strings.mjs";
import { attachmentLimits } from "../composer/index.mjs";

const NOTICES = new Set([
  "unsupported-file",
  "too-large",
  "unreadable",
  "too-many-files",
  "total-too-large",
  "visible-part",
]);

/** What a capture adds to the card's own composer. The pictures are ordinary
 * attachments of the card, so there is one box on screen; this keeps the part
 * the card cannot know: which quick question Enter sends, the one-time PDF
 * reader offer, and that Auto explain is paused while the question is open.
 *
 * host: attach(attachment) puts a chip in the card's composer (opening the
 *   card), show(view) tells the card, openPdfReader(), pauseAuto(),
 *   resumeAuto(). */
export function createQuick({ locale, host, autoExplain = () => false, once }) {
  let list = [];
  let notice = "";
  let paused = false;
  let offered = false;
  const text = pickText(locale);

  const view = () => {
    const { defaultId } = askModel({
      items: list.map((e) => e.taken ?? { kind: e.kind }),
      locale,
    });
    const blank = list.find(
      (e) =>
        e.taken?.window?.pdf &&
        !(e.taken.text ?? "").trim() &&
        e.taken.kind !== "text",
    );
    return {
      type: "quick",
      active: list.length > 0,
      defaultId,
      notice,
      pause: paused ? text("mini.pause") : "",
      offer:
        blank && offered ? { id: "pdf-reader", text: text("pdf.offer") } : null,
    };
  };

  function end(was = list.length > 0 || paused) {
    list = [];
    notice = "";
    offered = false;
    if (paused) host.resumeAuto?.();
    paused = false;
    if (was) host.show({ type: "quick", active: false });
  }

  return {
    /** entries: [{id, kind, attachment, taken?, thumb?}]. A pick made while a
     * question is open joins it: the earlier chips stay, the newest win. */
    async open(added) {
      if (!list.length && autoExplain()) {
        paused = true;
        host.pauseAuto?.();
      }
      list = [...list, ...added].slice(-attachmentLimits.count);
      notice = "";
      // The PDF offer is shown a single time, ever.
      if (
        !offered &&
        host.openPdfReader &&
        added.some(
          (e) =>
            e.taken?.window?.pdf &&
            !(e.taken.text ?? "").trim() &&
            e.taken.kind !== "text",
        ) &&
        once?.take("pdf-reader-offer")
      )
        offered = true;
      for (const entry of added) await host.attach(entry.attachment);
      host.show(view());
    },
    /** A one-line word for the open question, such as why a page came as its
     * visible part. Nothing happens when nothing is open. */
    note(code) {
      if (!list.length || !NOTICES.has(code)) return;
      notice = code;
      host.show(view());
    },
    /** The chips the open question holds, oldest first. */
    entries: () => list,
    /** The card removed a chip, named by its attachment's id. */
    remove(id) {
      const had = list.length > 0;
      list = list.filter((e) => e.attachment?.id !== id);
      if (list.length) host.show(view());
      else end(had);
    },
    async offer(id) {
      if (id === "pdf-reader" && offered) {
        offered = false;
        host.show(view());
        await host.openPdfReader?.();
      }
    },
    /** The card sent a turn, emptied itself or closed. */
    end: () => end(),
    dispose: () => end(),
  };
}
