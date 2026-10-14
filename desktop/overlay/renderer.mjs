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
// Fixed bounds and wrapping are measured before showing; each pill is clamped,
// and collisions are resolved vertically, keeping labels inside every display.
const placed = [];
const regions = initial.drawings.map((d) => d.rect);
function intersects(a, b) {
  return (
    a.x < b.x + b.width + 6 &&
    a.x + a.width + 6 > b.x &&
    a.y < b.y + b.height + 6 &&
    a.y + a.height + 6 > b.y
  );
}
function contains(a, b, inset = 0) {
  return (
    b.x >= a.x + inset &&
    b.y >= a.y + inset &&
    b.x + b.width <= a.x + a.width - inset &&
    b.y + b.height <= a.y + a.height - inset
  );
}
for (const item of items) {
  if (!item.label) continue;
  const b = item.label.getBoundingClientRect(),
    r = item.drawing.rect;
  const x = Math.max(8, Math.min(initial.width - b.width - 8, r.x + 8));
  const candidates = [
    { x, y: r.y - b.height - 10 },
    { x: r.x + r.width + 10, y: r.y },
    { x: r.x - b.width - 10, y: r.y },
    { x, y: r.y + r.height + 10 },
  ];
  for (let y = 8; y <= initial.height - b.height - 8; y += b.height + 8)
    candidates.push({ x, y });
  // Search free columns too before considering space inside a parent region.
  for (let xx = 8; xx <= initial.width - b.width - 8; xx += b.width + 8)
    for (let yy = 8; yy <= initial.height - b.height - 8; yy += b.height + 8)
      candidates.push({ x: xx, y: yy });
  const boxes = candidates
    .filter(
      (p) =>
        p.x >= 8 &&
        p.y >= 8 &&
        p.x + b.width <= initial.width - 8 &&
        p.y + b.height <= initial.height - 8,
    )
    .map((p) => ({ ...p, width: b.width, height: b.height }));
  const fits = (p, inside = false) =>
    !placed.some((b) => intersects(p, b)) &&
    !initial.avoid.some((b) => intersects(p, b)) &&
    !regions.some(
      (region) =>
        intersects(p, region) &&
        !(inside && contains(region, r) && contains(region, p, 8)),
    );
  // A full-screen or enclosing section has no exterior space. Its label may
  // sit inside that section, but never across an outline, a child/sibling's
  // content, another label, or an owned window. Prefer the lower margin.
  const inner = {
    x: r.x + 8,
    y: r.y + r.height - b.height - 8,
    width: b.width,
    height: b.height,
  };
  const p =
    boxes.find((p) => fits(p)) ??
    [inner, ...boxes].find(
      (p) =>
        contains(
          { x: 0, y: 0, width: initial.width, height: initial.height },
          p,
          8,
        ) && fits(p, true),
    );
  if (!p) {
    document.body.dataset.error = "Guide callouts cannot fit on this screen";
    throw Error(document.body.dataset.error);
  }
  Object.assign(item.label.style, { left: `${p.x}px`, top: `${p.y}px` });
  placed.push(p);
  masks.push(p);
}
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
