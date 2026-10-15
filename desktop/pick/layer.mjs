import {
  cssVariables,
  easing,
  springs,
  duration,
  timing,
  frameLog,
} from "../shared/motion.mjs";
import { stepSpring, settled } from "./spring.mjs";
import {
  cubicBezier,
  flightPath,
  genieColumns,
  genieSize,
  startAngle,
  turnedSize,
} from "./flight.mjs";
import { badgeOffset } from "./badge.mjs";
import { rectBetween, morphBox } from "./gesture.mjs";
import { partial, strokeProgress, effectDone, spotTrail } from "./draw.mjs";

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
const genieCanvas = document.getElementById("genie");
const genie = genieCanvas.getContext("2d");
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
let drag = null; // { rect, from } the area being dragged
let morph = null; // { from, start } the auto box turning into the band
let pointerLive = false; // this window saw the pointer since the drag began
let lock = null; // { plan, start }
let running = false;
let last = 0;
let painted = null; // the client box the canvas was last drawn into
// A highlighter stroke is up to a dozen px wide and wobbles a few px off its element, the lock is 18 px across.
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
    surface: style.getPropertyValue("--surface").trim(),
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
  const marker = stroke.role === "highlight";
  ctx.globalAlpha = marker ? 0.38 : 0.9;
  ctx.lineWidth = marker ? stroke.thickness : 2.5;
  ctx.strokeStyle = colors.green;
  // A highlighter has a flat chisel tip; the pens round off.
  ctx.lineCap = marker ? "butt" : "round";
  ctx.lineJoin = "round";
  pathOf(partial(shape, progress));
  ctx.stroke();
}

const spotWorthy = (plan) =>
  plan.effect === "outline" && plan.strokes.some((s) => s.role === "outline");

function drawSpot({ trail }) {
  ctx.lineCap = "round";
  ctx.fillStyle = colors.green;
  for (const [i, p] of trail.entries()) {
    ctx.globalAlpha = p.fade;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 - (3 * i) / trail.length, 0, Math.PI * 2);
    ctx.fill();
  }
  const head = trail[0];
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 1.8, 0, Math.PI * 2);
  ctx.fill();
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
  // While the button is down the same box is the rubber band: the auto box morphs
  // into the dragged rectangle and nothing stays behind.
  const target = drag
    ? toClient(dragRect())
    : outline?.rect
      ? toClient(outline.rect)
      : null;
  let banded = false;
  if (target) {
    const goal = [target.x, target.y, target.width, target.height];
    if (morph) {
      const t = reduced ? 1 : Math.min(1, (now - morph.start) / duration.fast);
      const e = ease(t);
      glide.value = morphBox(morph.from, target, e);
      glide.velocity = [0, 0, 0, 0];
      if (t >= 1) morph = null;
      else busy = true;
    } else if (drag) {
      glide.value = goal.slice();
      glide.velocity = [0, 0, 0, 0];
      banded = true;
    } else if (reduced || glide.opacity < 0.02) glide.value = goal.slice();
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
  if (drag) box = union(box, grow(toClient(dragRect()), REACH));
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
    } else if (!reduced && spotWorthy(item.plan)) {
      // A rectangle stays picked: a bright spot keeps running round its border.
      const border = item.plan.strokes.find((s) => s.role === "outline");
      const spot = spotTrail(
        border.points.map(toClientPoint),
        elapsed - item.plan.total,
        { period: timing.spotLap },
      );
      drawSpot(spot);
      busy = true;
      log("pick-spot", { x: spot.head.x, y: spot.head.y, width: 0, height: 0 });
    }
  }

  if (banded) {
    // The band follows this window's own pointer; the controller's rect is a
    // round trip behind it and only stands in until the pointer moves here.
    log("pick-band", target);
    log("pick-pointer", { ...cursor, width: 0, height: 0 });
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

function dragRect() {
  if (!drag.from || !pointerLive) return drag.rect;
  return rectBetween(drag.from, {
    x: cursor.x + origin.x,
    y: cursor.y + origin.y,
  });
}

function clearAll() {
  items = [];
  outline = null;
  drag = null;
  morph = null;
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

/** Thumbnails of what was taken are sucked into Blink's mouth along a lifted arc,
 * like a macOS genie, over `timing.genie` on the standard curve. */
function fly({ items: picked, to, token }) {
  const target = toClientPoint(to);
  const things = picked.map((item, index) => {
    const bounds = toClient(item.bounds);
    const size = genieSize(bounds);
    const path = flightPath({ from: bounds, to: target });
    const angle = startAngle(path);
    const turned = turnedSize(size, angle);
    // The picture turned so the path leaves along +x: its columns are cut across the way it travels.
    const sheet = document.createElement("canvas");
    sheet.width = Math.max(1, Math.round(turned.width));
    sheet.height = Math.max(1, Math.round(turned.height));
    const paint = sheet.getContext("2d");
    paint.translate(sheet.width / 2, sheet.height / 2);
    paint.rotate(-angle);
    const draw = (img) => {
      paint.clearRect(
        -sheet.width,
        -sheet.height,
        2 * sheet.width,
        2 * sheet.height,
      );
      paint.fillStyle = colors.surface;
      paint.fillRect(
        -size.width / 2,
        -size.height / 2,
        size.width,
        size.height,
      );
      if (img)
        paint.drawImage(
          img,
          -size.width / 2,
          -size.height / 2,
          size.width,
          size.height,
        );
      paint.strokeStyle = colors.green;
      paint.lineWidth = 2;
      paint.strokeRect(
        -size.width / 2,
        -size.height / 2,
        size.width,
        size.height,
      );
    };
    draw(null);
    let decoded = Promise.resolve();
    if (item.dataUrl) {
      const img = new Image();
      img.src = item.dataUrl;
      decoded = img
        .decode()
        .then(() => draw(img))
        .catch(() => {});
    }
    return {
      sheet,
      decoded,
      turned: { width: sheet.width, height: sheet.height },
      path,
      delay: index * stagger,
      done: false,
    };
  });
  genieCanvas.width = canvas.width;
  genieCanvas.height = canvas.height;
  // The clock starts on the first frame drawn, after the pictures are decoded, so
  // neither work in setting up nor in decoding eats into the first steps of the flight.
  let began = null;
  const step = (now) => {
    began ??= now;
    let pending = false;
    genie.setTransform(dpr, 0, 0, dpr, 0, 0);
    genie.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let box = null;
    things.forEach((thing, index) => {
      if (thing.done) return;
      if (now - began < thing.delay) {
        pending = true;
        return;
      }
      const run = reduceQuery.matches
        ? 1
        : Math.min(1, (now - began - thing.delay) / timing.genie);
      const finished = run >= 1;
      const p = finished ? 1 : ease(run);
      const columns = genieColumns(thing.path, thing.turned, p);
      for (const c of columns) {
        if (c.alpha <= 0.01) continue;
        genie.save();
        genie.globalAlpha = c.alpha;
        genie.translate(c.x, c.y);
        genie.rotate(c.angle);
        genie.drawImage(
          thing.sheet,
          c.index * c.sourceWidth,
          0,
          c.sourceWidth,
          thing.sheet.height,
          -c.length / 2,
          -c.height / 2,
          c.length,
          c.height,
        );
        genie.restore();
      }
      if (index === 0) {
        // The log wants a box: where the picture is now, its middle and its mean
        // size, which moves smoothly even while the ends stretch apart.
        const mean = (values) =>
          values.reduce((a, b) => a + b, 0) / values.length;
        const reach =
          mean(columns.map((c) => Math.hypot(c.length, c.height))) / 2;
        const cx = mean(columns.map((c) => c.x)),
          cy = mean(columns.map((c) => c.y));
        box = {
          x: cx - reach,
          y: cy - reach,
          width: 2 * reach,
          height: 2 * reach,
        };
      }
      if (finished) thing.done = true;
      else pending = true;
    });
    if (box) log("flight", box);
    if (pending) requestAnimationFrame(step);
    else {
      genie.clearRect(0, 0, window.innerWidth, window.innerHeight);
      api.flightDone(token);
    }
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
      if (!drag) {
        pointerLive = false;
        morph =
          value.rect && glide.opacity > 0.02
            ? { from: glide.value.slice(), start: performance.now() }
            : null;
      }
      drag = value.rect ? value : null;
      if (!drag) morph = null;
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
      // Beside the cursor, but never off the screen: near the right or bottom
      // edge it slides left or goes above the cursor.
      hint.style.transform = "none";
      hint.style.transform = `translate3d(${Math.round(
        Math.max(
          8,
          Math.min(cursor.x + 20, window.innerWidth - hint.offsetWidth - 8),
        ),
      )}px, ${Math.round(
        cursor.y + 28 + hint.offsetHeight > window.innerHeight - 8
          ? cursor.y - 20 - hint.offsetHeight
          : cursor.y + 28,
      )}px, 0)`;
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
  if (drag) {
    pointerLive = true;
    wake();
  }
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
