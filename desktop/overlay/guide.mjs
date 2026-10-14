import { randomUUID } from "node:crypto";
import { parseGuide, guideDrawings, guidePrompt } from "./schema.mjs";
import { collectTurn } from "./turn.mjs";
export const FAILURE = "導覽暫時無法完成，請再試一次。";
export const CLOSING =
  "導覽到這裡結束。想再看一次可以按「總覽」，也可以直接問我。";
export class GuideController {
  constructor({
    session,
    overlay,
    capture,
    onGuide = () => {},
    pageText = async () => "",
    language = () => "",
    timeoutMs,
  }) {
    Object.assign(this, {
      session,
      overlay,
      capture,
      onGuide,
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
    try {
      if (!this.session) throw Error("Claude session is starting");
      const capture =
        existingCapture ??
        (await this.capture.run("guide", displayId, controller.signal, {
          attach: false,
        }));
      if (!capture || controller.signal.aborted) return;
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
      if (
        (await this.overlay.show(capture, guideDrawings(guide, capture))) ===
        false
      )
        return;
      if (controller.signal.aborted) {
        this.overlay.dismiss();
        return;
      }
      this.guide = guide;
      this.index = -1;
      this.overview();
      return guide;
    } catch (error) {
      if (!controller.signal.aborted) {
        this.onGuide({
          phase: "error",
          message: FAILURE,
          bubbles: [FAILURE],
          retry: true,
        });
        this.failed = true;
        throw error;
      }
    } finally {
      if (this.controller === controller) this.controller = null;
    }
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
    this.overlay.step(index);
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
  /** The tour ran out of steps: outline everything again and say goodbye. */
  finish() {
    if (!this.guide || this.index >= this.guide.steps.length) return;
    const total = this.guide.steps.length;
    this.index = total;
    this.overlay.step(-1);
    this.onGuide({
      phase: "finished",
      index: total,
      total,
      bubbles: [CLOSING],
      canBack: true,
      canNext: false,
    });
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
    this.overlay.step(-1);
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
    this.overlay.dismiss("user");
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
