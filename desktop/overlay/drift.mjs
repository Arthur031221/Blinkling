import { maskBitmap, contentMoved } from "./change.mjs";
export const SAMPLE_WIDTH = 160;
export const SAMPLE_HEIGHT = 90;
/** Consecutive failed screenshots tolerated before the guide gives up. A single
 * compositor hiccup must not remove a guide the user is still reading. */
export const CAPTURE_FAILURE_LIMIT = 3;
// The first live frame still differs from the overlay-free reference where the
// overlay draws (arrow heads, soft outline edges, label shadows reach beyond the
// published masks), so its per-region check only reacts to a region that is
// mostly different, i.e. a window that moved away before the guide appeared.
// A region that its own label, arrow and Blink's bubbles mostly cover has too
// few clean cells left to judge, so it is skipped (`coverage`).
const FIRST_FRAME = { screen: 0.045, region: 0.4, coverage: 0.3 };

/** Pure content-drift test for a visible guide.
 *
 * The reference is the overlay-free screenshot the model saw. Every frame taken
 * while the guide is visible contains the overlay's own outlines, arrows and
 * Blink's bubbles, so comparing it to the reference reports a change on a
 * perfectly static screen. Instead the first live frame is checked against the
 * reference once (was the screen already different when the guide appeared?)
 * and then becomes the baseline; later frames are compared with that baseline,
 * where the overlay's drawing cancels out. Masks of both frames are unioned so
 * a bubble that grows while streaming is ignored in either position. */
export class DriftDetector {
  constructor({ display, reference }) {
    Object.assign(this, { display, reference });
    this.baseline = null;
    this.baselineMasks = [];
    this.previous = null;
  }
  /** The overlay drawing changed (a step was selected): adopt the next frame,
   * after checking it once against the last frame of the old drawing so a
   * window that moved in that moment is still noticed. */
  rebaseline() {
    if (this.baseline)
      this.previous = { frame: this.baseline, masks: this.baselineMasks };
    this.baseline = null;
    this.baselineMasks = [];
  }
  get ready() {
    return !!this.baseline;
  }
  observe(frame, masks, regions = []) {
    const { display } = this,
      w = SAMPLE_WIDTH,
      h = SAMPLE_HEIGHT;
    if (!this.baseline) {
      // Both drawings are masked; the lenient limits only react to a region
      // that is mostly different.
      const before = this.previous ?? { frame: this.reference, masks: [] };
      const all = [...before.masks, ...masks];
      this.previous = null;
      this.baseline = Buffer.from(frame);
      this.baselineMasks = masks;
      return contentMoved(
        maskBitmap(before.frame, w, h, display, all),
        maskBitmap(frame, w, h, display, all),
        w,
        h,
        display,
        regions,
        FIRST_FRAME,
      )
        ? "content-changed"
        : null;
    }
    const all = [...this.baselineMasks, ...masks];
    const moved = contentMoved(
      maskBitmap(this.baseline, w, h, display, all),
      maskBitmap(frame, w, h, display, all),
      w,
      h,
      display,
      regions,
    );
    return moved ? "content-changed" : null;
  }
}
