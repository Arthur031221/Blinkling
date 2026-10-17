/** What Blink's window is clipped to. Where the system clips the window itself
 * (Windows), whatever is drawn outside the shape is never seen, so the bubbles
 * are in it beside Blink and its fan, and so is whatever is drawn on Blink but takes
 * no click (the guide stick, the props of a costume play). Elsewhere the regions only say where a
 * press lands, and the bubbles are drawn whole without them. */
export const windowShape = (platform, regions, bubbles = [], drawn = []) =>
  platform === "win32" ? [...regions, ...drawn, ...bubbles] : regions;
