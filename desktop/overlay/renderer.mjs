import { placeCallouts, leaderFor } from "./layout.mjs";
import { markShape } from "../pointing/shapes.mjs";
import { badgeRect } from "../pointing/badge.mjs";
import { rings, snapRing } from "../pick/frame.mjs";
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
const FRAME_RADIUS = 8;
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
const offsets = new Map();
function clear() {
  for (const run of running) run.cancel();
  running = [];
  items = [];
  svg.replaceChildren();
  labels.replaceChildren();
  stage.classList.remove("faded");
}
/** The four edges of a mark's box as [x, y, width, height], thick enough to
 * land a click on. */
function outlineStrips({ x, y, width, height }, t = 10) {
  return [
    [x - t / 2, y - t / 2, width + t, t],
    [x - t / 2, y + height - t / 2, width + t, t],
    [x - t / 2, y - t / 2, t, height + t],
    [x + width - t / 2, y - t / 2, t, height + t],
  ];
}
let current = null;
async function draw(view) {
  clear();
  current = view;
  offsets.clear();
  document.documentElement.dataset.theme = view.theme;
  svg.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const masks = [];
  // What the overlay draws and a click must not treat as the background: the
  // number badges and the label pills take the click, the outlines are Blink's.
  const regions = [];
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
    if (shape.frame)
      for (const ring of rings(r, FRAME_RADIUS)) {
        const box = snapRing(ring, devicePixelRatio || 1);
        const el = document.createElementNS(ns, "rect");
        el.setAttribute("class", `frame ${ring.role}`);
        el.setAttribute("x", box.x);
        el.setAttribute("y", box.y);
        el.setAttribute("width", box.width);
        el.setAttribute("height", box.height);
        el.setAttribute("rx", ring.radius);
        el.setAttribute("stroke-width", ring.width);
        group.append(el);
      }
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
    regions.push(["badge", b.x, b.y, b.width, b.height, drawing.number]);
    for (const strip of outlineStrips(shape.bounds))
      regions.push(["mark", ...strip, drawing.number]);
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
    regions.push(["label", p.x, p.y, p.width, p.height, item.drawing.number]);
    const line = leaderFor(item.drawing.rect, p, view.avoid);
    if (line) {
      const el = document.createElementNS(ns, "line");
      el.setAttribute("class", "leader");
      for (const [k, v] of Object.entries(line)) el.setAttribute(k, v);
      item.group.append(el);
    }
  });
  // Native viewports can be fractionally wider than Electron's integer DIP
  // bounds. Stretch drawings and pills over the same frozen coordinate plane.
  const sx = innerWidth / view.width,
    sy = innerHeight / view.height;
  labels.style.transformOrigin = "0 0";
  labels.style.transform = `scale(${innerWidth / view.width}, ${innerHeight / view.height})`;
  window.overlayMasks = masks;
  reported = regions.map(([kind, x, y, w, h, n]) => [
    kind,
    x * sx,
    y * sy,
    w * sx,
    h * sy,
    n,
  ]);
  hidden = new Set();
  report();
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
// What a click must not treat as the background: only what is on show.
let noteMask = null,
  reported = [],
  hidden = new Set();
function report() {
  window.guideOverlay.regions(
    reported
      .filter((r) => !hidden.has(r[5]) && offsets.get(r[5])?.visible !== false)
      .map(([kind, x, y, w, h, n]) => {
        const o = offsets.get(n);
        return [kind, x + (o?.dx ?? 0), y + (o?.dy ?? 0), w, h];
      }),
  );
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
      for (const el of [item.group, item.badge, item.label].filter(Boolean)) {
        animate(el, [{ opacity: dim ? 0.25 : 1 }], "base");
        el.style.pointerEvents = "";
      }
    }
    hidden.clear();
    report();
    document.body.dataset.focus = set ? [...set].join(",") : "";
  },
  // Only the marks in the focus stay; the rest are put away until all show.
  solo(arg) {
    const set = numbers(arg);
    for (const item of items) {
      const hide = set !== null && !set.has(item.drawing.number);
      if (hide) hidden.add(item.drawing.number);
      else hidden.delete(item.drawing.number);
      for (const el of [item.group, item.badge, item.label].filter(Boolean)) {
        animate(el, [{ opacity: hide ? 0 : 1 }], "base");
        el.style.pointerEvents = hide ? "none" : "";
      }
    }
    report();
    document.body.dataset.focus = set ? [...set].join(",") : "";
  },
  // The card is above the marks: whatever of them lies under it is not drawn.
  // `arg` is the rectangles in display coordinates; none shows everything.
  cover(arg) {
    const boxes = (Array.isArray(arg) ? arg : []).filter(
      (r) => r && [r.x, r.y, r.width, r.height].every(Number.isFinite),
    );
    document.body.style.clipPath = boxes.length
      ? `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z ${boxes
          .map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z`)
          .join(" ")}")`
      : "";
  },
  // The page scrolled: `arg` is [{n, dx, dy, visible}], how far each mark is
  // from where it was drawn. CSS `translate` is its own property, so it never
  // fights the transform the entrance and focus animations run on.
  shift(arg) {
    for (const move of Array.isArray(arg) ? arg : []) {
      if (![move?.dx, move?.dy].every(Number.isFinite)) continue;
      offsets.set(move.n, move);
      for (const item of items.filter((i) => i.drawing.number === move.n))
        for (const el of [item.group, item.badge, item.label, item.note]) {
          if (!el) continue;
          el.style.translate = `${move.dx}px ${move.dy}px`;
          el.style.visibility = move.visible === false ? "hidden" : "";
        }
    }
    report();
  },
  // The step's explanation, directly under its mark, with back, next and end.
  // `arg` is {n, text, count, labels: {back, next, end}, canBack, canNext} or
  // null to take it away.
  note(arg) {
    // The note is drawn over the page like a label: the staleness watch does
    // not read it as the screen changing.
    if (window.overlayMasks && noteMask)
      window.overlayMasks = window.overlayMasks.filter((m) => m !== noteMask);
    noteMask = null;
    for (const item of items)
      if (item.note) {
        item.note.remove();
        item.note = null;
      }
    reported = reported.filter((r) => r[0] !== "note");
    document.body.dataset.note = "";
    const item = arg && items.find((i) => i.drawing.number === arg.n);
    if (!item) return report();
    const el = document.createElement("div");
    el.className = "note";
    const text = document.createElement("p");
    text.textContent = String(arg.text ?? "");
    const row = document.createElement("div");
    row.className = "note-row";
    const count = document.createElement("span");
    count.textContent = String(arg.count ?? "");
    row.append(count);
    for (const [dir, label, on] of [
      ["back", arg.labels?.back, arg.canBack !== false],
      ["next", arg.labels?.next, arg.canNext !== false],
      ["end", arg.labels?.end, true],
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.nav = dir;
      b.textContent = label ?? dir;
      b.disabled = !on;
      b.addEventListener("click", () => window.guideOverlay.nav(dir));
      row.append(b);
    }
    el.append(text);
    if (arg.hint) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = String(arg.hint);
      el.append(hint);
    }
    el.append(row);
    labels.append(el);
    const box = el.getBoundingClientRect();
    const r = item.drawing.rect;
    const x = Math.min(
      Math.max(8, r.x),
      Math.max(8, current.width - box.width - 8),
    );
    let y = r.y + r.height + 10;
    if (y + box.height > current.height - 8) y = r.y - box.height - 10;
    y = Math.min(Math.max(8, y), Math.max(8, current.height - box.height - 8));
    Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
    const o = offsets.get(arg.n);
    if (o) {
      el.style.translate = `${o.dx}px ${o.dy}px`;
      el.style.visibility = o.visible === false ? "hidden" : "";
    }
    item.note = el;
    noteMask = { x, y, width: box.width, height: box.height };
    window.overlayMasks = [...(window.overlayMasks ?? []), noteMask];
    const sx = innerWidth / current.width,
      sy = innerHeight / current.height;
    reported.push([
      "note",
      x * sx,
      y * sy,
      box.width * sx,
      box.height * sy,
      arg.n,
    ]);
    report();
    document.body.dataset.note = String(arg.n);
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
