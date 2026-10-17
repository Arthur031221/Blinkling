import { randomUUID } from "node:crypto";
import {
  GuideError,
  parseGuide,
  guideRefs,
  guidePrompt,
  stepNumbers,
} from "./schema.mjs";
import { collectTurn } from "./turn.mjs";
import { guideStrings } from "./strings.mjs";
import { pickLocale } from "../shared/i18n.mjs";
const FULL_WIDTH = new Set(["zh-TW", "zh-CN", "ja"]);
/** The one sentence a failure bubble shows: what went wrong, in plain words and
 * in the user's language (`locale` is a tag or a locale list). */
export function failureMessage(error, stage, locale) {
  const t = guideStrings(locale);
  const detail = String(error?.message ?? error ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  let reason;
  if (stage === "session") reason = t("session");
  else if (stage === "capture") reason = t("capture");
  else if (stage === "draw") reason = t("draw");
  else if (/timed out/i.test(detail)) reason = t("timeout");
  else if (error instanceof GuideError)
    reason = /no usable step/.test(detail) ? t("noSteps") : t("unreadable");
  else reason = t("reported", { detail: detail || t("unknown") });
  const [colon, stop] = FULL_WIDTH.has(pickLocale(locale))
    ? ["：", "。"]
    : [": ", "."];
  return `${t("failure")}${colon}${reason}${stop}`;
}
/** The goodbye bubble when the tour runs out of steps. */
export const closingMessage = (locale) => guideStrings(locale)("closing");
export class GuideController {
  constructor({
    session,
    overlay,
    capture,
    pointing,
    onGuide = () => {},
    onEnd = () => {},
    pageText = async () => "",
    language = () => "",
    timeoutMs,
  }) {
    Object.assign(this, {
      session,
      overlay,
      capture,
      pointing,
      onGuide,
      onEnd,
      pageText,
      language,
      timeoutMs,
    });
    this.dismissed = () => {
      this.guide = null;
      this.onGuide({ phase: "dismissed" });
    };
    overlay.on("dismissed", this.dismissed);
  }
  async start(displayId, existingCapture) {
    this.dismiss();
    this.lastDisplay = displayId;
    const controller = (this.controller = new AbortController());
    this.onGuide({ phase: "thinking" });
    let stage = "session";
    try {
      if (!this.session) throw Error("Claude session is starting");
      stage = "capture";
      const capture =
        existingCapture ??
        (await this.capture.run("guide", displayId, controller.signal, {
          attach: false,
        }));
      if (!capture || controller.signal.aborted) return;
      stage = "turn";
      const text = await collectTurn(
        this.session,
        {
          id: randomUUID(),
          text: guidePrompt(capture, await this.pageText(), this.language()),
          attachments: [capture.image],
          source: "guide",
        },
        { signal: controller.signal, timeoutMs: this.timeoutMs },
      );
      if (controller.signal.aborted) return;
      const guide = parseGuide(text, capture);
      stage = "draw";
      const drawn = await this.pointing.show(guideRefs(guide), {
        displayId: capture.display.id,
        capture,
        snap: false,
      });
      if (controller.signal.aborted) {
        if (drawn) this.pointing.clear("user");
        return;
      }
      if (!drawn) {
        this.fail(Error("nothing to draw"), stage);
        return;
      }
      this.guide = guide;
      this.capture_ = capture;
      this.ended = false;
      this.index = -1;
      this.overview();
      return guide;
    } catch (error) {
      if (!controller.signal.aborted) {
        this.fail(error, stage);
        throw error;
      }
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
  fail(error, stage) {
    const message = failureMessage(error, stage, this.language());
    this.onGuide({ phase: "error", message, bubbles: [message], retry: true });
    this.failed = true;
  }
  step(index) {
    if (
      !this.guide ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.guide.steps.length
    )
      return;
    this.index = index;
    this.pointing.focus(stepNumbers(this.guide, index));
    this.onGuide({
      phase: "step",
      index,
      total: this.guide.steps.length,
      title: this.title(index),
      aim: this.aim(index),
      rects: this.rects(index),
      bubbles: [this.guide.steps[index].note],
      canBack: index > 0,
      canNext: true,
      last: index === this.guide.steps.length - 1,
    });
  }
  next() {
    if (!this.guide) return;
    if (this.index >= this.guide.steps.length - 1) this.finish();
    else this.step(this.index + 1);
  }
  back() {
    if (!this.guide) return;
    if (this.index >= this.guide.steps.length)
      this.step(this.guide.steps.length - 1);
    else if (this.index > 0) this.step(this.index - 1);
  }
  /** The label of the first region a step points at. */
  title(index) {
    const step = this.guide.steps[index];
    return (
      this.guide.sections.find((s) => s.id === step.regionIds[0])?.label ??
      step.id
    );
  }
  /** Where a step points on the screen, in screen coordinates: the middle of
   * its first region, which is where Blink's pointer aims. */
  aim(index) {
    const display = this.capture_?.display;
    const region = this.guide.sections.find(
      (s) => s.id === this.guide.steps[index].regionIds[0],
    );
    if (!display || !region) return null;
    const w = display.bounds.width / this.capture_.pixelWidth,
      h = display.bounds.height / this.capture_.pixelHeight;
    return {
      x: display.bounds.x + (region.rect.x + region.rect.width / 2) * w,
      y: display.bounds.y + (region.rect.y + region.rect.height / 2) * h,
    };
  }
  /** The screen rectangles of the regions a step points at (all of them with no
   * step), so the card can keep off what the step is about. */
  rects(index = null) {
    const display = this.capture_?.display;
    if (!display || !this.guide) return [];
    const w = display.bounds.width / this.capture_.pixelWidth,
      h = display.bounds.height / this.capture_.pixelHeight;
    const ids =
      index === null
        ? this.guide.sections.map((s) => s.id)
        : this.guide.steps[index].regionIds;
    return this.guide.sections
      .filter((s) => ids.includes(s.id))
      .map((s) => ({
        x: Math.round(display.bounds.x + s.rect.x * w),
        y: Math.round(display.bounds.y + s.rect.y * h),
        width: Math.round(s.rect.width * w),
        height: Math.round(s.rect.height * h),
      }));
  }
  /** A click on mark `n` shows the first step that is about it. */
  focusMark(n) {
    if (!this.guide) return;
    const index = this.guide.steps.findIndex((_, i) =>
      stepNumbers(this.guide, i).includes(n),
    );
    if (index >= 0) this.step(index);
  }
  /** The tour ran out of steps: show every mark again, say goodbye, and hand
   * the saver what it needs once. */
  finish() {
    if (!this.guide || this.index >= this.guide.steps.length) return;
    const total = this.guide.steps.length;
    this.index = total;
    this.pointing.focus(null);
    this.onGuide({
      phase: "finished",
      aim: null,
      rects: [],
      index: total,
      total,
      bubbles: [closingMessage(this.language())],
      canBack: true,
      canNext: false,
    });
    if (!this.ended) {
      this.ended = true;
      this.onEnd(guideEnd(this.guide, this.capture_));
    }
  }
  /** Reruns the failed guide on a fresh capture of the same display. */
  retry() {
    return this.lastDisplay === undefined
      ? Promise.resolve()
      : this.start(this.lastDisplay);
  }
  overview() {
    if (!this.guide) return;
    this.index = -1;
    this.pointing.focus(null);
    this.onGuide({
      phase: "overview",
      index: -1,
      total: this.guide.steps.length,
      aim: null,
      rects: this.rects(),
      bubbles: [this.guide.purpose],
      // All steps: one line each, each a way into that step.
      steps: this.guide.steps.map((step, i) => ({
        title: this.title(i),
        note: step.note,
      })),
      canBack: false,
      canNext: this.guide.steps.length > 0,
    });
  }
  dismiss() {
    this.controller?.abort();
    this.pointing.clear("user");
    // A capture still held would keep Auto explain busy: end it here.
    if (this.overlay.capture) this.overlay.dismiss("user");
    this.guide = null;
    if (this.failed) {
      this.failed = false;
      this.onGuide({ phase: "dismissed" });
    }
  }
  dispose() {
    this.dismiss();
    this.overlay.removeListener("dismissed", this.dismissed);
  }
}
/** What k4's saver takes: {title, steps, explanation, shots}. */
function guideEnd(guide, capture) {
  const label = new Map(guide.sections.map((s) => [s.id, s.label]));
  return {
    title: guide.title,
    explanation: guide.purpose,
    steps: guide.steps.map((step, i) => ({
      n: i + 1,
      title: label.get(step.regionIds[0]) ?? step.id,
      text: step.note,
    })),
    shots: capture?.image
      ? [
          {
            data: capture.image.data,
            width: capture.pixelWidth,
            height: capture.pixelHeight,
          },
        ]
      : [],
  };
}
