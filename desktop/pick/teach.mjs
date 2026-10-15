/** Teach it once (M7). Two pieces: the one-time hint bubbles, and the welcome's
 * looping animation of the highlighter and rectangle picks and the flight into
 * Blink. The welcome window mounts the animation; this module
 * owns what it shows. */

/** The first hold of the pick key shows one small bubble near the cursor, and the
 * first pick made while the key is still held says that more can follow. After
 * that neither hint is produced again, across restarts. */
export function createPickHint({ once, t }) {
  return {
    /** The hint text on the first call, null on every later one. */
    onRaise: () => (once.take("pick-hint") ? t("hint.pick") : null),
    /** What to say once a pick lands while the key is held, once ever. */
    onPick: () => (once.take("pick-several") ? t("hint.several") : null),
  };
}

const el = (doc, tag, className, text) => {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The looping welcome animation: Ctrl and click a line of text (a highlighter stroke
 * draws, a thumbnail flies into Blink), then Ctrl and drag an area (a rectangle
 * grows, the flight again). All motion is CSS on transform and opacity
 * in teach.css, timed from the shared tokens, and it stands still under reduced
 * motion. `keyName` is "Control", "Ctrl" or "Option". */
export function mountPickAnimation(root, { keyName, dragLabel }) {
  const doc = root.ownerDocument;
  const demo = el(doc, "div", "pick-demo");
  demo.setAttribute("aria-hidden", "true");

  const page = el(doc, "div", "demo-page");
  for (let i = 0; i < 4; i++)
    page.append(el(doc, "span", `demo-line demo-line-${i + 1}`));
  page.append(el(doc, "span", "demo-picture"));

  const blink = el(doc, "span", "demo-blink");
  const sceneClick = el(doc, "div", "demo-scene demo-scene-click");
  sceneClick.append(
    el(doc, "span", "demo-stroke"),
    el(doc, "span", "demo-thumb"),
    el(doc, "span", "demo-cursor"),
    el(doc, "span", "demo-key", keyName),
  );
  const sceneDrag = el(doc, "div", "demo-scene demo-scene-drag");
  sceneDrag.append(
    el(doc, "span", "demo-area"),
    el(doc, "span", "demo-thumb"),
    el(doc, "span", "demo-cursor"),
    el(doc, "span", "demo-key", `${keyName} + ${dragLabel}`),
  );
  demo.append(page, blink, sceneClick, sceneDrag);
  root.append(demo);
  return { element: demo, destroy: () => demo.remove() };
}
