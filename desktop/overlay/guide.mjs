import { randomUUID } from "node:crypto";
import {
  GuideError,
  parseGuide,
  guideRefs,
  guidePrompt,
  stepNumbers,
} from "./schema.mjs";
import { collectTurn } from "./turn.mjs";
export const FAILURE = "導覽暫時無法完成";
/** The one sentence a failure bubble shows: what went wrong, in plain words. */
export function failureMessage(error, stage) {
  const detail = String(error?.message ?? error ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  let reason;
  if (stage === "session") reason = "Claude 還在啟動，請稍等幾秒再試";
  else if (stage === "capture") reason = "沒辦法擷取這個螢幕的畫面";
  else if (stage === "draw") reason = "畫面上沒有可以標示的區塊";
  else if (/timed out/i.test(detail)) reason = "Claude 太久沒有回覆";
  else if (error instanceof GuideError)
    reason = /no usable step/.test(detail)
      ? "Claude 的回覆裡沒有可以照著走的步驟"
      : "Claude 的回覆不是我能讀的格式";
  else reason = `Claude 回報了問題（${detail || "原因不明"}）`;
  return `${FAILURE}：${reason}。`;
}
export const CLOSING =
  "導覽到這裡結束。想再看一次可以按「總覽」，也可以直接問我。";
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
    const message = failureMessage(error, stage);
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
  /** The tour ran out of steps: show every mark again, say goodbye, and hand
   * the saver what it needs once. */
  finish() {
    if (!this.guide || this.index >= this.guide.steps.length) return;
    const total = this.guide.steps.length;
    this.index = total;
    this.pointing.focus(null);
    this.onGuide({
      phase: "finished",
      index: total,
      total,
      bubbles: [CLOSING],
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
      bubbles: [
        this.guide.purpose,
        ...this.guide.sections.flatMap((s) => [
          `${s.label}：${s.description}`,
          ...s.paragraphs,
        ]),
      ],
      canBack: false,
      canNext: this.guide.steps.length > 0,
    });
  }
  dismiss() {
    this.controller?.abort();
    this.pointing.clear("user");
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
