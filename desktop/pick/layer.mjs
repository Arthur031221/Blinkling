import {
  cssVariables,
  easing,
  springs,
  duration,
  frameLog,
} from "../shared/motion.mjs";
import { stepSpring, settled } from "./spring.mjs";
import { cubicBezier, flightPath, flightAt, thumbnailSize } from "./flight.mjs";
import { badgeOffset } from "./badge.mjs";
import { partial, strokeProgress, effectDone } from "./draw.mjs";

const api = window.pickLayerAPI;
const log = frameLog();
const root = document.documentElement;
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.+)/);
  if (name?.trim()) root.style.setProperty(name.trim(), value.trim());
}

const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");
const badge = document.getElementById("badge");
const hint = document.getElementById("hint");
const flights = document.getElementById("flights");
const ease = cubicBezier(easing.standard);
const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");

let origin = { x: 0, y: 0 };
let dpr = 1;
let colors = {};
let cursor = { x: 0, y: 0 };
let items = []; // { plan, bounds, start }
let outline = null; // { rect, kind } the last target from the controller
let glide = {
  value: [0, 0, 0, 0],
  velocity: [0, 0, 0, 0],
  opacity: 0,
  opacityVelocity: 0,
};
let drag = null;
let lock = null; // { plan, start }
let running = false;
let last = 0;
let painted = null; // the client box the canvas was last drawn into
// A crayon stroke is 10 px wide and wobbles a few px off its element, the lock is 18 px across.
const REACH = 24;

const toClient = (r) => ({
  x: r.x - origin.x,
  y: r.y - origin.y,
  width: r.width,
  height: r.height,
});
const grow = (r, by) => ({
  x: r.x - by,
  y: r.y - by,
  width: r.width + 2 * by,
  height: r.height + 2 * by,
});
const union = (a, b) => {
  if (!a || !b) return a ?? b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};
const toClientPoint = (p) => ({ x: p.x - origin.x, y: p.y - origin.y });

function readColors() {
  const style = getComputedStyle(root);
  colors = {
    green: style.getPropertyValue("--green").trim(),
    warn: style.getPropertyValue("--warn").trim(),
    radius: parseFloat(style.getPropertyValue("--radius-s")) || 0,
  };
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  readColors();
  wake();
});

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  painted = null;
  wake();
}
window.addEventListener("resize", resize);

function wake() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

function badgeSet(name) {
  badge.classList.toggle("is-crayon", name === "crayon");
  badge.classList.toggle("is-crosshair", name === "crosshair");
  document.body.classList.toggle("is-crosshair", name === "crosshair");
}

function placeBadge() {
  const at = badgeOffset(
    cursor,
    { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    { width: 24, height: 24 },
  );
  badge.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
}

function svg(name, attributes) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attributes)) el.setAttribute(k, v);
  return el;
}
function buildBadge() {
  const crayon = svg("svg", { viewBox: "0 0 24 24", class: "crayon" });
  crayon.append(
    svg("path", { class: "crayon-body", d: "M16.5 2.5l5 5-11 11-6 1 1-6z" }),
    svg("path", { class: "crayon-tip", d: "M3.5 20.5l.8-4.2 3.4 3.4z" }),
  );
  const crosshair = svg("svg", { viewBox: "0 0 24 24", class: "crosshair" });
  crosshair.append(
    svg("circle", { class: "crosshair-ring", cx: 12, cy: 12, r: 6 }),
    svg("path", {
      class: "crosshair-line",
      d: "M12 2v5M12 17v5M2 12h5M17 12h5",
    }),
  );
  badge.append(crayon, crosshair);
}
buildBadge();

function pathOf(points) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
}

function drawStroke(stroke, progress, bounds) {
  if (progress <= 0) return;
  const shape = stroke.points.map(toClientPoint);
  if (stroke.role === "sweep") {
    // A soft band that travels down the element and is gone when it arrives.
    const b = toClient(bounds);
    const y = b.y + b.height * progress;
    ctx.globalAlpha = 0.16 * (1 - progress);
    ctx.fillStyle = colors.green;
    ctx.fillRect(b.x, b.y, b.width, y - b.y);
    return;
  }
  const crayon = stroke.role === "crayon";
  ctx.globalAlpha = crayon ? 0.4 : 0.9;
  ctx.lineWidth = crayon ? 10 : 2.5;
  ctx.strokeStyle = colors.green;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  pathOf(partial(shape, progress));
  ctx.stroke();
}

function drawLock(plan, elapsed) {
  const at = toClientPoint(plan.at);
  const fade =
    1 -
    ease(
      Math.min(1, Math.max(0, (elapsed - plan.total / 2) / (plan.total / 2))),
    );
  ctx.globalAlpha = fade;
  ctx.fillStyle = colors.warn;
  ctx.strokeStyle = colors.warn;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(at.x - 9, at.y - 2, 18, 14, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(at.x, at.y - 2, 6, Math.PI, 0);
  ctx.stroke();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const reduced = reduceQuery.matches;
  let busy = false;

  // The hover outline glides to where the controller says it is.
  const target = outline?.rect ? toClient(outline.rect) : null;
  if (target) {
    const goal = [target.x, target.y, target.width, target.height];
    if (reduced || glide.opacity < 0.02) glide.value = goal.slice();
    else
      for (let i = 0; i < 4; i++) {
        const next = stepSpring(
          { value: glide.value[i], velocity: glide.velocity[i] },
          goal[i],
          springs.crisp,
          dt,
        );
        glide.value[i] = settled(next, goal[i]) ? goal[i] : next.value;
        glide.velocity[i] = settled(next, goal[i]) ? 0 : next.velocity;
      }
    if (glide.value.some((v, i) => v !== goal[i])) busy = true;
  }
  const opacityGoal = target ? 1 : 0;
  const nextOpacity = reduced
    ? { value: opacityGoal, velocity: 0 }
    : stepSpring(
        { value: glide.opacity, velocity: glide.opacityVelocity },
        opacityGoal,
        springs.crisp,
        dt,
      );
  glide.opacity = settled(nextOpacity, opacityGoal)
    ? opacityGoal
    : nextOpacity.value;
  glide.opacityVelocity = settled(nextOpacity, opacityGoal)
    ? 0
    : nextOpacity.velocity;
  if (glide.opacity !== opacityGoal) busy = true;

  // Only what was drawn, and what is about to be, is wiped: a full-screen clear is the
  // dearest thing a frame does on a dense display.
  let box = null;
  if (glide.opacity > 0.01)
    box = union(
      box,
      grow(
        {
          x: glide.value[0],
          y: glide.value[1],
          width: glide.value[2],
          height: glide.value[3],
        },
        REACH,
      ),
    );
  for (const item of items)
    box = union(box, grow(toClient(item.bounds), REACH));
  if (drag) box = union(box, grow(toClient(drag), REACH));
  if (lock) {
    const at = toClientPoint(lock.plan.at);
    box = union(box, grow({ x: at.x, y: at.y, width: 0, height: 0 }, REACH));
  }
  const wipe = union(painted, box);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (wipe) ctx.clearRect(wipe.x, wipe.y, wipe.width, wipe.height);
  painted = box;

  if (glide.opacity > 0.01) {
    const [x, y, w, h] = glide.value;
    ctx.globalAlpha = glide.opacity;
    ctx.strokeStyle = colors.green;
    ctx.fillStyle = colors.green;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, colors.radius);
    ctx.globalAlpha = glide.opacity * 0.08;
    ctx.fill();
    ctx.globalAlpha = glide.opacity;
    ctx.stroke();
    if (busy) log("pick-effect", { x, y, width: w, height: h });
  }

  for (const item of items) {
    const elapsed = now - item.start;
    for (const stroke of item.plan.strokes)
      drawStroke(stroke, strokeProgress(stroke, elapsed, ease), item.bounds);
    if (!effectDone(item.plan, elapsed)) {
      busy = true;
      log("pick-effect", toClient(item.bounds));
    }
  }

  if (drag) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.green;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    const r = toClient(drag);
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.setLineDash([]);
  }

  if (lock) {
    const elapsed = now - lock.start;
    drawLock(lock.plan, elapsed);
    if (effectDone(lock.plan, elapsed)) lock = null;
    else busy = true;
  }
  ctx.globalAlpha = 1;

  running = busy;
  if (busy) requestAnimationFrame(frame);
}

function clearAll() {
  items = [];
  outline = null;
  drag = null;
  lock = null;
  glide = {
    value: [0, 0, 0, 0],
    velocity: [0, 0, 0, 0],
    opacity: 0,
    opacityVelocity: 0,
  };
  badgeSet("none");
  hint.classList.remove("is-shown");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  painted = null;
}

const stagger = Math.round(duration.fast / 8);

/** Thumbnails of what was taken fly to Blink along a lifted arc, driven by a
 * critically damped spring so the motion can be interrupted at any frame. */
function fly({ items: picked, to, token }) {
  const target = toClientPoint(to);
  const things = picked.map((item, index) => {
    const bounds = toClient(item.bounds);
    const size = thumbnailSize(bounds);
    const el = document.createElement("div");
    el.className = "pick-flight";
    el.style.width = `${size.width}px`;
    el.style.height = `${size.height}px`;
    let decoded = Promise.resolve();
    if (item.dataUrl) {
      const img = document.createElement("img");
      img.src = item.dataUrl;
      img.alt = "";
      el.append(img);
      decoded = img.decode().catch(() => {});
    }
    el.style.opacity = "0";
    flights.append(el);
    return {
      el,
      decoded,
      size,
      path: flightPath({ from: bounds, to: target }),
      spring: { value: 0, velocity: 0 },
      delay: index * stagger,
      done: false,
    };
  });
  // The clock starts on the first frame drawn, after the pictures are decoded, so
  // neither work in setting up nor in decoding eats into the first steps of the flight.
  let began = null;
  let previous = null;
  const step = (now) => {
    began ??= now;
    const dt = previous === null ? 0 : Math.min(0.05, (now - previous) / 1000);
    previous = now;
    let pending = false;
    things.forEach((thing, index) => {
      if (thing.done) return;
      if (now - began < thing.delay) {
        pending = true;
        thing.el.style.opacity = "0";
        return;
      }
      thing.spring = reduceQuery.matches
        ? { value: 1, velocity: 0 }
        : stepSpring(thing.spring, 1, springs.crisp, dt);
      const finished = settled(thing.spring, 1);
      const p = finished ? 1 : thing.spring.value;
      const at = flightAt(thing.path, p);
      thing.el.style.opacity = String(at.opacity);
      thing.el.style.transform = `translate3d(${at.x - thing.size.width / 2}px, ${at.y - thing.size.height / 2}px, 0) scale(${at.scale})`;
      if (index === 0) log("flight", thing.el.getBoundingClientRect());
      if (finished) {
        thing.done = true;
        thing.el.remove();
      } else pending = true;
    });
    if (pending) requestAnimationFrame(step);
    else api.flightDone(token);
  };
  void Promise.all(things.map((thing) => thing.decoded)).then(() =>
    requestAnimationFrame(step),
  );
}

api.onInit((init) => {
  origin = init.origin;
  readColors();
  resize();
  api.ready();
});

api.onMessage(({ channel, value }) => {
  switch (channel) {
    case "cursor":
      cursor = toClientPoint(value);
      placeBadge();
      break;
    case "badge":
      badgeSet(value.name);
      placeBadge();
      break;
    case "outline":
      outline = value.lock ? null : value;
      wake();
      break;
    case "drag":
      drag = value.rect;
      wake();
      break;
    case "taken": {
      const entry = {
        plan: value.effect,
        bounds: value.bounds,
        start: performance.now(),
      };
      if (value.grew && items[value.index]) items[value.index] = entry;
      else items.push(entry);
      wake();
      break;
    }
    case "lock":
      lock = { plan: value.plan, start: performance.now() };
      wake();
      break;
    case "refused":
      break;
    case "hint":
      hint.textContent = value.text;
      hint.style.transform = `translate3d(${Math.round(cursor.x + 20)}px, ${Math.round(cursor.y + 28)}px, 0)`;
      hint.classList.add("is-shown");
      break;
    case "clear":
      clearAll();
      break;
    case "flight":
      fly(value);
      break;
  }
});

let moveQueued = null;
function report(type, event) {
  api.pointer(type, event.clientX + origin.x, event.clientY + origin.y);
}
window.addEventListener("pointermove", (event) => {
  cursor = { x: event.clientX, y: event.clientY };
  placeBadge();
  if (!moveQueued)
    moveQueued = requestAnimationFrame(() => {
      moveQueued = null;
      report("move", { clientX: cursor.x, clientY: cursor.y });
    });
});
window.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  hint.classList.remove("is-shown");
  report("down", event);
});
window.addEventListener("pointerup", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  report("up", event);
});
window.addEventListener("contextmenu", (event) => event.preventDefault());
