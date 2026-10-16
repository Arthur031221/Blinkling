import { live, pickLocale } from "../shared/i18n.mjs";
import { guideStrings } from "./strings.mjs";
import { saveGuide as writeGuide } from "./save.mjs";

/** The one id every save bubble uses, so a newer line replaces the older one
 * instead of stacking beside it (N2.4). */
const BUBBLE = "guide-save";
/** The action the bubble asks the shell to run. */
export const SAVE_ACTION = "save-guide";

/** The end of a guide offers one quiet 儲存導覽 bubble. Clicking it writes the
 * guide as Markdown with its annotated screenshots under
 * Documents/Blinkling Guides and reveals the folder. There is no replay and no
 * list of saved guides (N3.9): the folder is the only record.
 *
 * `offerSave(result)` takes the guide end event { title, steps, explanation,
 * shots[] } and returns whether it offered anything. `save()` is what the
 * bubble's action calls. Only the newest guide can be saved, and a second click
 * while a save runs joins it. */
export function createGuideOffer({
  send,
  languages = [],
  saveGuide = writeGuide,
  ...options // documents, reveal, now: passed on to saveGuide
}) {
  let pending, running;
  const strings = (guide) =>
    guideStrings(
      guide?.language ? [guide.language] : [pickLocale(live(languages))],
    );

  const offer = (guide, note) =>
    send({
      type: "blink-offer",
      id: BUBBLE,
      label: note
        ? `${note} · ${strings(guide)("save")}`
        : strings(guide)("save"),
      action: SAVE_ACTION,
    });

  async function run(guide) {
    const t = strings(guide);
    try {
      const saved = await saveGuide(guide, options);
      pending = undefined;
      send({ type: "blink-say", id: BUBBLE, text: t("saved") });
      return { ok: true, ...saved };
    } catch (error) {
      // The guide stays offered so a full disk or a locked folder can be retried.
      offer(guide, t("saveFailed"));
      return { ok: false, error: String(error?.message ?? error) };
    }
  }

  return {
    offerSave(result) {
      const shots = result?.screenshots ?? result?.shots ?? [];
      const steps = Array.isArray(result?.steps) ? result.steps : [];
      if (!steps.length && !shots.length) return false;
      pending = { ...result, screenshots: shots };
      offer(pending);
      return true;
    },
    save() {
      if (running) return running;
      if (!pending)
        return Promise.resolve({ ok: false, error: "No guide to save" });
      running = run(pending).finally(() => {
        running = undefined;
      });
      return running;
    },
    dispose() {
      pending = undefined;
    },
  };
}
