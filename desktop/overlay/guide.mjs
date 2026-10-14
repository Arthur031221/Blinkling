import { randomUUID } from "node:crypto";
import { parseGuide, guideDrawings, guidePrompt } from "./schema.mjs";
import { collectTurn } from "./turn.mjs";
export class GuideController {
  constructor({
    session,
    overlay,
    capture,
    onGuide = () => {},
    pageText = async () => "",
    timeoutMs,
  }) {
    Object.assign(this, {
      session,
      overlay,
      capture,
      onGuide,
      pageText,
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
    if (!this.session) throw Error("Claude session is starting");
    const controller = (this.controller = new AbortController());
    this.onGuide({ phase: "thinking" });
    try {
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
          text: guidePrompt(capture, await this.pageText()),
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
          message: "導覽暫時無法完成，請再試一次。",
        });
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
      canNext: index < this.guide.steps.length - 1,
    });
  }
  next() {
    this.step(this.index + 1);
  }
  back() {
    this.step(Math.max(0, this.index - 1));
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
      canNext: true,
    });
  }
  dismiss() {
    this.controller?.abort();
    this.overlay.dismiss();
    this.guide = null;
  }
  dispose() {
    this.dismiss();
    this.overlay.removeListener("dismissed", this.dismissed);
  }
}
