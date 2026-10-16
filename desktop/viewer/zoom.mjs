/** The most the picture may be enlarged: 800% of its own size. */
export const MAX_SCALE = 8;
/** The space kept around the picture when it is fitted. */
export const MARGIN = 32;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const near = (a, b) => Math.abs(a - b) < 1e-3;

/** Where the picture sits in the viewer. `view` and `image` are {width, height}
 * in CSS pixels; the picture is drawn with `translate(x, y) scale(scale)` from
 * its top left corner. The least zoom is the fit (never above 100%, so a small
 * picture is not blown up) and the most is 800%. */
export function createZoom({ view, image }) {
  let size = { ...view };
  const fit = () =>
    Math.min(
      1,
      Math.max(size.width - 2 * MARGIN, 1) / image.width,
      Math.max(size.height - 2 * MARGIN, 1) / image.height,
    );
  let scale = fit();
  let x = 0;
  let y = 0;
  /** Held inside the viewer: centred on an axis the picture does not fill. */
  const settle = () => {
    const w = image.width * scale,
      h = image.height * scale;
    x = w <= size.width ? (size.width - w) / 2 : clamp(x, size.width - w, 0);
    y = h <= size.height ? (size.height - h) / 2 : clamp(y, size.height - h, 0);
  };
  settle();
  /** Sets the zoom, keeping the picture point under `at` where it is. */
  const zoomTo = (next, at = { x: size.width / 2, y: size.height / 2 }) => {
    const target = clamp(next, fit(), MAX_SCALE);
    const px = (at.x - x) / scale,
      py = (at.y - y) / scale;
    scale = target;
    x = at.x - px * scale;
    y = at.y - py * scale;
    settle();
  };
  return {
    state: () => ({ scale, x, y, fit: fit(), max: MAX_SCALE }),
    /** A wheel notch: deltaY in pixels, ctrl for a trackpad pinch. */
    wheel(at, deltaY, { ctrl = false } = {}) {
      const rate = ctrl ? 0.01 : 0.0018;
      zoomTo(scale * Math.exp(-clamp(deltaY, -240, 240) * rate), at);
    },
    /** A two finger pinch: `ratio` is the new distance over the old one. */
    pinch: (at, ratio) => zoomTo(scale * ratio, at),
    pan(dx, dy) {
      x += dx;
      y += dy;
      settle();
    },
    /** A double click: from the fit to 100% (200% when 100% is the fit), and
     * back to the fit from anywhere else. */
    toggle(at) {
      if (near(scale, fit())) zoomTo(fit() >= 1 ? 2 : 1, at);
      else zoomTo(fit(), at);
    },
    resize(next) {
      const wasFit = near(scale, fit());
      size = { ...next };
      if (wasFit) scale = fit();
      else scale = clamp(scale, fit(), MAX_SCALE);
      settle();
    },
  };
}
