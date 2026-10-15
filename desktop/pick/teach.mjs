/** The pick animation (N1.2): hold Ctrl, crayon the lines, a thumbnail flies
 * into Blink. Shown once on the welcome card and as the first-hold hint. No
 * Electron in here, so any renderer can mount it. Only transform and opacity
 * move, every duration is a motion token, and dispose() stops it at any frame. */
import { duration, easing, timing } from "../shared/motion.mjs";
import { flightKeyframes, flightPath } from "./flight.mjs";
import { pickText } from "./strings.mjs";

const SCENE = { width: 260, height: 132 };
const LINES = [
  { y: 30, width: 168 },
  { y: 52, width: 196 },
  { y: 74, width: 140 },
];
const BLINK = { x: 228, y: 96, size: 22 };
const THUMB = { width: 52, height: 30 };
const FLIGHT_STEPS = 8;

function box(doc, parent, props, className) {
  const el = doc.createElement("div");
  if (className) el.className = className;
  Object.assign(el.style, { position: "absolute", ...props });
  parent.append(el);
  return el;
}

export function mountPickAnimation(container, { reducedMotion = false, locale } = {}) {
  const doc = container.ownerDocument;
  const t = pickText(locale);
  const root = doc.createElement("div");
  root.className = "pick-teach";
  Object.assign(root.style, {
    position: "relative",
    width: `${SCENE.width}px`,
    height: `${SCENE.height + 28}px`,
    color: "var(--text)",
    fontSize: "var(--type-s)",
  });
  const scene = box(doc, root, {
    left: "0px",
    top: "0px",
    width: `${SCENE.width}px`,
    height: `${SCENE.height}px`,
    background: "var(--surface-2)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-m)",
    overflow: "hidden",
  });

  const key = box(doc, scene, {
    left: "12px",
    top: "6px",
    padding: "1px 8px",
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-s)",
    fontSize: "var(--type-xs)",
  });
  key.textContent = "Ctrl";

  const strokes = LINES.map((line) => {
    box(doc, scene, {
      left: "12px",
      top: `${line.y}px`,
      width: `${line.width}px`,
      height: "8px",
      background: "var(--line)",
      borderRadius: "var(--radius-pill)",
    });
    return box(doc, scene, {
      left: "10px",
      top: `${line.y - 3}px`,
      width: `${line.width + 4}px`,
      height: "14px",
      background: "var(--green)",
      borderRadius: "var(--radius-pill)",
      opacity: "0",
      transformOrigin: "0% 50%",
    });
  });

  const blink = box(doc, scene, {
    left: `${BLINK.x}px`,
    top: `${BLINK.y}px`,
    width: `${BLINK.size}px`,
    height: `${BLINK.size}px`,
    background: "var(--green)",
    borderRadius: "var(--radius-pill)",
  });
  const thumb = box(doc, scene, {
    left: "0px",
    top: "0px",
    marginLeft: `${-THUMB.width / 2}px`,
    marginTop: `${-THUMB.height / 2}px`,
    width: `${THUMB.width}px`,
    height: `${THUMB.height}px`,
    background: "var(--surface)",
    border: "1px solid var(--green)",
    borderRadius: "var(--radius-s)",
    opacity: "0",
  });
  const caption = box(doc, root, { left: "0px", top: `${SCENE.height + 8}px` });
  caption.textContent = t("hint");
  container.append(root);

  const running = new Set();
  let stopped = false;
  const play = (el, keyframes, options) => {
    const animation = el.animate(keyframes, { fill: "both", easing: easing.standard, ...options });
    running.add(animation);
    const done = animation.finished.finally(() => running.delete(animation));
    done.catch(() => {}); // a cancelled animation ends the loop, nothing else
    return done;
  };
  const wait = (ms) =>
    new Promise((resolve, reject) => {
      const id = setTimeout(resolve, ms);
      running.add({
        cancel: () => {
          clearTimeout(id);
          reject(new Error("stopped"));
        },
      });
    });

  const settled = () => {
    for (const s of strokes) s.style.opacity = "0.42";
  };

  async function loop() {
    const start = { x: 12 + THUMB.width / 2, y: LINES[0].y + THUMB.height / 2 };
    const path = flightPath(start, { x: BLINK.x + BLINK.size / 2, y: BLINK.y + BLINK.size / 2 });
    while (!stopped) {
      await play(key, [{ opacity: 0.4 }, { opacity: 1 }], { duration: duration.base });
      await wait(timing.pickHold);
      const drawn = strokes.map((stroke, i) =>
        play(
          stroke,
          [
            { opacity: 0.42, transform: "scaleX(0)" },
            { opacity: 0.42, transform: "scaleX(1)" },
          ],
          { duration: duration.base, delay: i * duration.fast },
        ),
      );
      await Promise.all(drawn);
      await play(thumb, [{ opacity: 0 }, { opacity: 1 }], { duration: duration.fast });
      await play(thumb, flightKeyframes(path, FLIGHT_STEPS), { duration: duration.slow });
      await play(blink, [{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }], {
        duration: duration.base,
      });
      await wait(duration.slow * 3);
      await Promise.all([
        ...strokes.map((s) => play(s, [{ opacity: 0.42 }, { opacity: 0 }], { duration: duration.base })),
        play(key, [{ opacity: 1 }, { opacity: 0.4 }], { duration: duration.base }),
      ]);
      await wait(duration.slow);
    }
  }

  if (reducedMotion) {
    settled();
    play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: duration.fast });
  } else void loop().catch(() => {});

  return {
    dispose() {
      stopped = true;
      for (const animation of [...running]) animation.cancel();
      running.clear();
      root.remove();
    },
  };
}
