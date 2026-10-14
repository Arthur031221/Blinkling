import { placeCallouts } from "./layout.mjs";
const ns = "http://www.w3.org/2000/svg",
  svg = document.querySelector("#drawings"),
  labels = document.querySelector("#labels");
const initial = await window.guideOverlay.init();
document.documentElement.dataset.theme = initial.theme;
svg.setAttribute("viewBox", `0 0 ${initial.width} ${initial.height}`);
svg.setAttribute("preserveAspectRatio", "none");
const items = [],
  masks = [];
function element(tag, attrs) {
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  svg.append(el);
  return el;
}
for (const drawing of initial.drawings) {
  const r = drawing.rect;
  const outline = element("rect", {
    ...r,
    rx: drawing.label ? 8 : 0,
    class: "outline",
  });
  const item = { drawing, outline, arrows: [] };
  masks.push({
    x: Math.max(0, r.x - 4),
    y: Math.max(0, r.y - 4),
    width: r.width + 8,
    height: r.height + 8,
    borderOnly: true,
  });
  for (const a of drawing.arrows) {
    const line = element("path", {
      d: `M${a.from.x} ${a.from.y} Q${a.from.x} ${a.to.y} ${a.to.x} ${a.to.y}`,
      class: "arrow",
    });
    item.arrows.push({ line, step: a.step });
    masks.push({
      x: Math.min(a.from.x, a.to.x) - 10,
      y: Math.min(a.from.y, a.to.y) - 10,
      width: Math.abs(a.from.x - a.to.x) + 20,
      height: Math.abs(a.from.y - a.to.y) + 20,
    });
  }
  if (drawing.label) {
    const label = document.createElement("div");
    label.className = "label";
    const number = document.createElement("span");
    number.className = "number";
    number.textContent = drawing.number;
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = drawing.label;
    label.append(number, text);
    labels.append(label);
    item.label = label;
  }
  items.push(item);
}
await document.fonts.ready;
// Fixed bounds and wrapping are measured before showing; layout.mjs keeps each
// pill inside the display and clear of other pills, and drops a pill that has
// no room at all instead of failing the whole guide.
const boxes = placeCallouts({
  width: initial.width,
  height: initial.height,
  avoid: initial.avoid,
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
document.body.dataset.dropped = dropped;
// Native viewports can be fractionally wider than Electron's integer DIP
// bounds. Stretch both drawings and callouts over the same frozen coordinate
// plane so the far edge remains aligned with the captured monitor.
labels.style.transformOrigin = "0 0";
labels.style.transform = `scale(${innerWidth / initial.width}, ${innerHeight / initial.height})`;
function step(index) {
  for (const item of items) {
    const active = index === -1 || item.drawing.steps.includes(index);
    item.outline.hidden = !active; // SVG does not implement HTMLElement.hidden.
    item.outline.style.display = active ? "" : "none";
    if (item.label) item.label.hidden = !active;
    for (const a of item.arrows)
      a.line.style.display =
        active && (index === -1 || a.step === index || a.step === -1)
          ? ""
          : "none";
  }
  document.body.dataset.step = index;
}
window.overlayMasks = masks;
window.guideOverlay.onStep(step);
step(initial.step);
document.body.dataset.ready = "true";
