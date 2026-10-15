import { placeCallouts } from "./layout.mjs";
import { markShape } from "../pointing/shapes.mjs";
import { badgeRect } from "../pointing/badge.mjs";
import { cssVariables, duration, easing, frameLog } from "../shared/motion.mjs";
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.+)/);
  if (name?.trim())
    document.documentElement.style.setProperty(name.trim(), value.trim());
}
const ns = "http://www.w3.org/2000/svg",
  stage = document.querySelector("#stage"),
  svg = document.querySelector("#drawings"),
  labels = document.querySelector("#labels"),
  frames = frameLog(),
  still = matchMedia("(prefers-reduced-motion: reduce)");
let items = [],
  running = [];
const ms = (token) => (still.matches ? 0 : duration[token]);
// Motion animates transform and opacity only, and a new animation replaces the
// one running on the same element, so every change can be interrupted.
function animate(el, keyframes, token, curve = easing.standard) {
  const run = el.animate(keyframes, {
    duration: ms(token),
    easing: curve,
    fill: "both",
  });
  running.push(run);
  trace(ms(token));
  return run;
}
// One frame-log entry per frame while something moves (N6.8).
let tracing = 0;
function trace(length) {
  const until = performance.now() + length;
  if (tracing >= until) return;
  const live = tracing > performance.now();
  tracing = until;
  if (live) return;
  const tick = () => {
    const box = stage.getBoundingClientRect();
    frames("pointing", box);
    if (performance.now() < tracing) requestAnimationFrame(tick);
    else tracing = 0;
  };
  requestAnimationFrame(tick);
}
function path(d, className) {
  const el = document.createElementNS(ns, "path");
  el.setAttribute("d", d);
  el.setAttribute("class", className);
  return el;
}
function clear() {
  for (const run of running) run.cancel();
  running = [];
  items = [];
  svg.replaceChildren();
  labels.replaceChildren();
  stage.classList.remove("faded");
}
async function draw(view) {
  clear();
  document.documentElement.dataset.theme = view.theme;
  svg.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const masks = [];
  for (const drawing of view.drawings) {
    const r = drawing.rect;
    const shape = markShape(drawing.kind, r, {
      seed: drawing.seed,
      lines: drawing.lines,
    });
    const group = document.createElementNS(ns, "g");
    group.setAttribute("class", `mark ${drawing.kind}`);
    group.dataset.n = drawing.number;
    for (const d of shape.paths)
      group.append(path(d, shape.fill ? "stroke fill" : "stroke"));
    svg.append(group);
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.dataset.n = drawing.number;
    badge.textContent = drawing.number;
    const b = badgeRect(r, view);
    Object.assign(badge.style, { left: `${b.x}px`, top: `${b.y}px` });
    badge.addEventListener("click", () =>
      window.guideOverlay.markClick(drawing.number),
    );
    labels.append(badge);
    masks.push(
      { ...b },
      {
        x: Math.max(0, shape.bounds.x),
        y: Math.max(0, shape.bounds.y),
        width: shape.bounds.width,
        height: shape.bounds.height,
        borderOnly: true,
      },
    );
    const item = { drawing, group, badge };
    if (drawing.label) {
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = drawing.label;
      labels.append(label);
      item.label = label;
    }
    items.push(item);
  }
  await document.fonts.ready;
  // Pills are measured at their final size before they are placed or shown, so
  // nothing reflows when they appear; layout.mjs keeps each one on the display
  // and clear of the others, and drops a pill that has no room.
  const boxes = placeCallouts({
    width: view.width,
    height: view.height,
    avoid: view.avoid,
    items: items.map((item) => ({
      rect: item.drawing.rect,
      size: item.label
        ? (({ width, height }) => ({ width, height }))(
            item.label.getBoundingClientRect(),
          )
        : null,
    })),
  });
  let dropped = 0;
  items.forEach((item, i) => {
    if (!item.label) return;
    const p = boxes[i];
    if (!p) {
      item.label.remove();
      item.label = null;
      dropped++;
      return;
    }
    Object.assign(item.label.style, { left: `${p.x}px`, top: `${p.y}px` });
    masks.push(p);
  });
  // Native viewports can be fractionally wider than Electron's integer DIP
  // bounds. Stretch drawings and pills over the same frozen coordinate plane.
  labels.style.transformOrigin = "0 0";
  labels.style.transform = `scale(${innerWidth / view.width}, ${innerHeight / view.height})`;
  window.overlayMasks = masks;
  for (const { group, badge, label } of items)
    for (const el of [group, badge, label].filter(Boolean))
      animate(
        el,
        [
          { opacity: 0, transform: "scale(0.94)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        "base",
        easing.enter,
      );
  document.body.dataset.dropped = dropped;
  document.body.dataset.drawn = view.seq;
}
const numbers = (arg) =>
  arg === null || arg === undefined
    ? null
    : new Set([arg].flat().filter(Number.isInteger));
const commands = {
  pulse(n) {
    const item = items.find((i) => i.drawing.number === n);
    if (!item) return;
    for (const el of [item.group, item.badge])
      animate(
        el,
        [
          { transform: "scale(1)" },
          { transform: "scale(1.12)", offset: 0.4 },
          { transform: "scale(1)" },
        ],
        "slow",
      );
  },
  // The marks outside the focus dim; no argument brings them all back.
  focus(arg) {
    const set = numbers(arg);
    for (const item of items) {
      const dim = set !== null && !set.has(item.drawing.number);
      for (const el of [item.group, item.badge, item.label].filter(Boolean))
        animate(el, [{ opacity: dim ? 0.25 : 1 }], "base");
    }
    document.body.dataset.focus = set ? [...set].join(",") : "";
  },
  fade() {
    stage.classList.add("faded");
    trace(ms("slow"));
  },
  revive() {
    stage.classList.remove("faded");
    trace(ms("slow"));
  },
};
function command({ name, arg }) {
  if (Object.hasOwn(commands, name)) commands[name](arg);
}
function fail(error) {
  document.body.dataset.error = error?.message ?? String(error);
}
window.guideOverlay.onDraw((view) => draw(view).catch(fail));
window.guideOverlay.onCommand(command);
try {
  await draw(await window.guideOverlay.init());
} catch (error) {
  fail(error);
}
