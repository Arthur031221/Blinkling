/** The pick layer's page: the outline, the cursor badge, the crayon effect
 * and the flight into Blink. Everything that moves animates transform and
 * opacity only (N6.3) and starts from whatever is on screen, so it can be
 * interrupted and reversed (N6.2). */
import { duration, easing, frameLog } from "../shared/motion.mjs";
import { planEffect } from "./effects.mjs";
import { bandRects, textBands } from "./lines.mjs";
import { FLIGHT_MS, flightKeyframes, flightPath, thumbSize } from "./flight.mjs";

const SVG = "http://www.w3.org/2000/svg";
const FLIGHT_STEPS = 24;
const TEXT_SCAN_WIDTH = 800;
const NOTE_FADE = duration.fast;

const $ = (id) => document.getElementById(id);
const stage = $("stage"),
  outline = $("outline"),
  area = $("area"),
  effects = $("effects"),
  badge = $("badge"),
  note = $("note");
const frame = frameLog();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const motion = (extra = {}) => ({ duration: duration.fast, easing: easing.standard, ...extra });

let origin = { x: 0, y: 0 };
let pointer = { x: 0, y: 0 };
let outlineShown = false;
let mode = "crayon";
let lastState = null;

const local = (r) => ({ ...r, x: r.x - origin.x, y: r.y - origin.y });
const matrix = (r) => `matrix(${r.width}, 0, 0, ${r.height}, ${r.x}, ${r.y})`;
const place = (el, x, y) => (el.style.transform = `translate3d(${x}px, ${y}px, 0)`);

/** Move a box to a new rectangle from wherever it currently is. */
function moveBox(el, rect, animate) {
  const next = matrix(rect);
  const from = getComputedStyle(el).transform;
  el.style.transform = next;
  if (animate && from && from !== "none")
    el.animate([{ transform: from }, { transform: next }], motion());
}

function fade(el, to, options = {}) {
  const from = Number(getComputedStyle(el).opacity);
  el.style.opacity = String(to);
  el.animate([{ opacity: from }, { opacity: to }], motion(options));
}

function setMode(next) {
  if (next === mode) return;
  const leaving = badge.querySelector(`.${mode}`);
  const entering = badge.querySelector(`.${next}`);
  mode = next;
  badge.dataset.mode = next;
  leaving.animate([{ opacity: 1 }, { opacity: 0 }], motion());
  entering.animate([{ opacity: 0 }, { opacity: 1 }], motion());
}

function render(state) {
  lastState = state;
  origin = state.origin;
  if (state.cursor) {
    pointer = { x: state.cursor.x - origin.x, y: state.cursor.y - origin.y };
    place(badge, pointer.x - 4, pointer.y - 20);
  }
  stage.dataset.active = String(state.active);
  stage.dataset.locked = String(state.locked);
  setMode(!state.active ? mode : state.locked ? "lock" : state.mode);
  if (state.active && state.outline && !state.area) {
    moveBox(outline, local(state.outline), outlineShown);
    if (!outlineShown) fade(outline, 1);
    outlineShown = true;
  } else if (outlineShown) {
    fade(outline, 0);
    outlineShown = false;
  }
  if (state.area) {
    area.hidden = false;
    area.style.transform = matrix(local(state.area));
    area.style.opacity = "1";
  } else if (!area.hidden) {
    area.hidden = true;
  }
  const message = state.full ? state.text.full : state.locked ? state.text.lock : state.hint;
  if (message && note.textContent !== message) {
    note.textContent = message;
    if (note.hidden) {
      note.hidden = false;
      note.animate([{ opacity: 0 }, { opacity: 1 }], motion({ duration: NOTE_FADE }));
    }
  } else if (!message && !note.hidden) {
    const gone = note.animate([{ opacity: 1 }, { opacity: 0 }], motion({ duration: NOTE_FADE }));
    gone.finished.then(() => {
      if (!lastState?.hint && !lastState?.full && !lastState?.locked) note.hidden = true;
    });
    note.textContent = "";
  }
  if (!state.active) outlineShown = false;
  requestAnimationFrame(() => {
    (globalThis.__blinklingPick ??= {}).shownAt = performance.timeOrigin + performance.now();
    globalThis.__blinklingPick.active = state.active;
  });
}

addEventListener("pointermove", (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  place(badge, pointer.x - 4, pointer.y - 20);
  window.pickLayer.pointer("move", e.clientX, e.clientY);
});
addEventListener("pointerdown", (e) => {
  if (e.button === 0) window.pickLayer.pointer("down", e.clientX, e.clientY);
});
addEventListener("pointerup", (e) => {
  if (e.button === 0) window.pickLayer.pointer("up", e.clientX, e.clientY);
});
addEventListener("contextmenu", (e) => e.preventDefault());

async function measureLines(taken) {
  const img = new Image();
  img.src = `data:image/png;base64,${taken.image.data}`;
  await img.decode();
  const k = Math.min(1, TEXT_SCAN_WIDTH / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const bitmap = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return bandRects(textBands(bitmap), bitmap, taken.bounds);
}

const SLIDE = { left: ["X", -1], right: ["X", 1], top: ["Y", -1], bottom: ["Y", 1] };

/** One primitive: a clipping wrapper slides in while its content slides the
 * other way, so the drawing stays put and is uncovered along its direction. */
function draw(container, p, effect, text) {
  const bleed = Math.ceil(p.width / 2) + 2;
  const box = local(p.box);
  const wrap = document.createElement("div");
  wrap.className = "wipe";
  wrap.dataset.role = p.role;
  wrap.dataset.effect = effect;
  wrap.style.left = `${box.x - bleed}px`;
  wrap.style.top = `${box.y - bleed}px`;
  wrap.style.width = `${box.width + 2 * bleed}px`;
  wrap.style.height = `${box.height + 2 * bleed}px`;
  let content;
  if (p.role === "sweep") {
    content = document.createElement("div");
    content.className = "sweep";
  } else if (p.role === "tag") {
    content = document.createElement("div");
    content.className = "tag";
    content.textContent = text.thisFrame;
  } else {
    content = document.createElementNS(SVG, "svg");
    content.setAttribute(
      "viewBox",
      `${-bleed} ${-bleed} ${box.width + 2 * bleed} ${box.height + 2 * bleed}`,
    );
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", p.d);
    path.setAttribute("stroke-width", String(p.width));
    content.append(path);
  }
  wrap.append(content);
  const options = { duration: p.duration, delay: p.delay, easing: easing.standard, fill: "both" };
  const runs = [];
  if (p.reveal === "fade") {
    runs.push(wrap.animate([{ opacity: 0 }, { opacity: 1 }], options));
  } else {
    const [axis, sign] = SLIDE[p.reveal];
    const at = (n) => `translate${axis}(${n}%)`;
    runs.push(wrap.animate([{ transform: at(sign * 100) }, { transform: at(0) }], options));
    runs.push(content.animate([{ transform: at(-sign * 100) }, { transform: at(0) }], options));
  }
  container.append(wrap);
  return { wrap, runs };
}

/** Log a frame for every paint of `box` until `until` settles. */
function track(surface, box, until) {
  let running = true;
  const tick = () => {
    if (!running) return;
    frame(surface, box());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  until.finally(() => {
    running = false;
  });
}

async function play({ taken, seed, blink, reducedMotion, text, origin: next }) {
  origin = next;
  const noMotion = reducedMotion || reduced();
  const lines = taken.kind === "text" && !noMotion ? await measureLines(taken).catch(() => []) : [];
  const plan = planEffect({ kind: taken.kind, bounds: taken.bounds, lines, seed, reducedMotion: noMotion });
  const container = document.createElement("div");
  container.className = "play";
  effects.append(container);
  const drawn = plan.primitives.map((p) => draw(container, p, plan.effect, text));
  const drawing = Promise.all(drawn.flatMap((d) => d.runs.map((r) => r.finished)));
  track("pick-effect", () => local(taken.bounds), drawing);

  const size = thumbSize(taken.bounds);
  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.src = `data:image/png;base64,${taken.image.data}`;
  thumb.width = size.width;
  thumb.height = size.height;
  thumb.style.marginLeft = `${-size.width / 2}px`;
  thumb.style.marginTop = `${-size.height / 2}px`;
  container.append(thumb);

  const start = local(taken.bounds);
  const path = flightPath(start, { x: blink.x - origin.x, y: blink.y - origin.y });
  let flight;
  if (noMotion) {
    const p = path.at(0);
    thumb.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    flight = thumb.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: duration.fast,
      delay: plan.total,
      easing: easing.standard,
      fill: "both",
    });
  } else {
    flight = thumb.animate(flightKeyframes(path, FLIGHT_STEPS), {
      duration: FLIGHT_MS,
      delay: Math.max(0, plan.total - duration.fast),
      easing: easing.standard,
      fill: "both",
    });
  }
  track("flight", () => thumb.getBoundingClientRect(), flight.finished);
  await flight.finished;
  window.pickLayer.landed();
  const out = container.animate([{ opacity: 1 }, { opacity: 0 }], motion({ fill: "forwards" }));
  await out.finished;
  container.remove();
}

window.pickLayer.onState(render);
window.pickLayer.onPlay((message) => void play(message));
