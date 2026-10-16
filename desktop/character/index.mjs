import {
  BODY,
  LEG,
  LIMB_LINE,
  STAND,
  armGeom,
  clamp,
  drawBlink,
  ease,
  f1,
  lerp,
  legGeom,
  silhouette,
} from "./rig.mjs";
import {
  BLEND,
  CATCH_FOR,
  DIZZY_FOR,
  PEEK_EDGE,
  blendPose,
  catching,
  dizzy,
  facePose,
  gazeYaw,
  grumbling,
  held,
  idle,
  landed,
  looking,
  peek,
  touched,
  greeting,
} from "./motions.mjs";
import { BLINK_SCALE as K } from "./size.mjs";
import { roundedRect } from "./silhouette.mjs";
export { CATCH_FOR, DIZZY_FOR };

/** The box the renderer gives Blink, and where its feet stand in it. The drawing is
 * 200 units wide; K pixels to the unit, with the feet at (100, 190) in the drawing
 * on the box's foot point. */
export const BOX = Object.freeze({
  width: 148,
  height: 152,
  footX: 74,
  footY: 142,
});
export const FEET = Object.freeze({ x: 100, y: 190 });
const VIEW = [
  FEET.x - BOX.footX / K,
  FEET.y - BOX.footY / K,
  BOX.width / K,
  BOX.height / K,
];
/** Where the peek line of the drawing lands on each edge, and how the figure turns
 * so that its feet point at the edge: the hands grip a line in the drawing, and that
 * line is laid on the screen edge. */
const EDGES = {
  bottom: { angle: 0, x: 100, y: 80 },
  top: { angle: 180, x: 100, y: 50 },
  right: { angle: -90, x: 100, y: 105 },
  left: { angle: 90, x: 100, y: 105 },
};
const FACE_FIELDS = [
  "eyes",
  "open",
  "look",
  "lid",
  "lidTilt",
  "mouth",
  "mp",
  "blush",
  "attach",
  "front",
];
const SCENE = ["front", "back", "attach", "faceExtra"];
const NS = "http://www.w3.org/2000/svg";

const pick = (pose, keys) =>
  Object.fromEntries(keys.filter((k) => k in pose).map((k) => [k, pose[k]]));
const without = (pose, keys) =>
  Object.fromEntries(Object.entries(pose).filter(([k]) => !keys.includes(k)));
const ring = (x, y, r, n = 12) =>
  Array.from({ length: n }, (_, i) => ({
    x: x + Math.cos((i / n) * Math.PI * 2) * r,
    y: y + Math.sin((i / n) * Math.PI * 2) * r,
  }));

/** The status dot: shown only while the connection is in trouble. */
const dotSvg = (dot) =>
  dot
    ? `<circle class="status" data-connection="${dot}" cx="62" cy="54" r="6.5" style="fill:var(--warn)" stroke="#fff" stroke-width="2"/>`
    : "";

/** Blink: one drawing per frame from the rig, a pose chosen from what the app is
 * doing, and the shapes of that pose for click-through. */
export function mountBlink(host) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", VIEW.map(f1).join(" "));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Blink");
  host.append(svg);
  const ctx = {
    key: null,
    from: null,
    last: null,
    blendAt: 0,
    blendFor: BLEND,
    touchAt: 0,
    dragAt: -1,
    yaw: 0,
    peek: 0,
    time: null,
    edge: "right",
    outer: { angle: 0, x: FEET.x, y: PEEK_EDGE },
    drawn: "",
  };

  /** The pose the app asks for right now, and the motion it belongs to. */
  function choose(time, o) {
    const face = o.face ?? "idle";
    const grumble = o.grumbling && face === "idle";
    let base = { ...idle(time), ...facePose(face, time) };
    let key = `face:${face}`;
    if (grumble) {
      base = { ...base, ...grumbling(time) };
      key = "grumble";
    }
    const plain = (pose) => ({ ...without(base, SCENE), ...pose });
    if (o.mode === "drag") {
      if (ctx.dragAt < 0) ctx.dragAt = time;
      return {
        key: "held",
        pose: held(time, time - ctx.dragAt, o.velocity ?? 0),
        blend: 0.2,
      };
    }
    ctx.dragAt = -1;
    const woke = time - (o.dizzyAt ?? -100);
    if (woke >= 0 && woke < DIZZY_FOR)
      return { key: "dizzy", pose: dizzy(woke), blend: 0.25 };
    const down = time - (o.dropAt ?? -100);
    if (o.mode === "drop" || (down >= 0 && down < 0.35)) {
      const d = clamp(down, 0, 1);
      const bounce = Math.sin(d * 23) * Math.exp(-d * 8);
      return {
        key: "land",
        pose: plain({ ...landed(), y: -Math.abs(bounce) * 10 }),
        blend: 0.1,
      };
    }
    const caught = time - (o.catchAt ?? -100);
    if (caught >= 0 && caught < CATCH_FOR)
      return { key: "catch", pose: plain(catching(time, caught)), blend: 0.12 };
    if (o.touch) {
      const id = `touch:${o.touch.part}${o.touch.side}`;
      if (ctx.key !== id) ctx.touchAt = time;
      return {
        key: id,
        pose: plain(
          touched(time, o.touch.part, o.touch.side, time - ctx.touchAt),
        ),
        blend: BLEND,
      };
    }
    const waved = time - (o.waveAt ?? -100);
    if (waved >= 0 && waved < 1.5)
      return { key: "wave", pose: plain(greeting(time, waved)), blend: 0.3 };
    if (o.gaze) {
      ctx.yaw = lerp(ctx.yaw, gazeYaw(o.gaze), 1 - Math.exp(-ctx.dt * 8));
      return {
        key: "gaze",
        pose: plain(looking(time, o.gaze, ctx.yaw)),
        blend: 0.25,
      };
    }
    ctx.yaw = 0;
    return { key, pose: base, blend: BLEND };
  }

  /** Eased toward the pose that grips the screen edge, or away from it. */
  function leaning(mode, edge, dt) {
    ctx.peek +=
      ((mode === "peek" ? 1 : 0) - ctx.peek) * (1 - Math.exp(-dt * 7));
    if (Math.abs(ctx.peek - (mode === "peek" ? 1 : 0)) < 0.002)
      ctx.peek = mode === "peek" ? 1 : 0;
    if (mode === "peek") ctx.edge = EDGES[edge] ? edge : "right";
    return ctx.peek;
  }

  /** A gaze on the screen as the tilted head sees it: the figure is turned by the
   * edge it grips, and its eyes turn back by the same angle. */
  function gripGaze(gaze) {
    if (!gaze) return {};
    const a = (EDGES[ctx.edge].angle * Math.PI) / 180,
      x = gaze.x * Math.cos(a) + gaze.y * Math.sin(a),
      y = -gaze.x * Math.sin(a) + gaze.y * Math.cos(a),
      m = Math.hypot(x, y) || 1;
    return { look: [(x / m) * Math.min(1, m), (y / m) * Math.min(1, m)] };
  }

  function pose(time, o = {}) {
    ctx.dt = clamp(ctx.time === null ? 1 / 60 : time - ctx.time, 0, 0.1);
    ctx.time = time;
    const { key, pose: target, blend } = choose(time, o);
    if (key !== ctx.key) {
      ctx.from = ctx.last ?? target;
      ctx.key = key;
      ctx.blendAt = time;
      ctx.blendFor = blend;
    }
    let out = blendPose(
      ctx.from,
      target,
      ease((time - ctx.blendAt) / ctx.blendFor),
    );
    const lean = leaning(o.mode, o.edge, ctx.dt);
    if (lean > 0) {
      // Gripping the edge, only the face still follows the session.
      const face =
        o.grumbling && (o.face ?? "idle") === "idle"
          ? grumbling(time)
          : facePose(o.face ?? "idle", time);
      out = blendPose(
        out,
        {
          ...peek(time, ctx.edge),
          ...pick(face, FACE_FIELDS),
          ...gripGaze(o.gaze),
        },
        ease(lean),
      );
      // The edge hides the rest of Blink only once it is gripping it.
      if (lean > 0.4)
        out.clipY = lerp(320, PEEK_EDGE, ease((lean - 0.4) / 0.6));
      out.armsOver = lean > 0.5;
      if (lean > 0.5) out.back = "";
    }
    out.attach = (out.attach ?? "") + dotSvg(o.dot);
    out.noShadow = true;
    ctx.last = out;
    const edge = EDGES[ctx.edge];
    ctx.outer = {
      angle: lerp(0, edge.angle, ease(lean)),
      x: lerp(FEET.x, edge.x, ease(lean)),
      y: lerp(PEEK_EDGE, edge.y, ease(lean)),
    };
    const { angle, x, y } = ctx.outer;
    const frame = `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(angle)}) translate(${-FEET.x} ${-PEEK_EDGE})">${drawBlink(out, "b")}</g>`;
    if (frame !== ctx.drawn) {
      svg.innerHTML = frame;
      ctx.drawn = frame;
    }
    return out;
  }

  /** The drawing's coordinates as the screen sees them. */
  function toScreen() {
    const m = svg.getScreenCTM?.();
    if (m)
      return (p) => ({
        x: m.a * p.x + m.c * p.y + m.e,
        y: m.b * p.x + m.d * p.y + m.f,
      });
    const r = svg.getBoundingClientRect();
    const s = r.width / VIEW[2] || 1;
    return (p) => ({
      x: r.x + (p.x - VIEW[0]) * s,
      y: r.y + (p.y - VIEW[1]) * s,
    });
  }

  /** Every shape that takes a click, in the drawing's coordinates after the pose has
   * moved and tilted the figure and the edge has turned it. */
  function shapes() {
    const o = { ...STAND, ...ctx.last };
    const sil = silhouette(o.yaw);
    const out = {
      body: roundedRect(
        sil.x1 - BODY.line / 2,
        BODY.top - BODY.line / 2,
        sil.x2 - sil.x1 + BODY.line,
        BODY.bottom - BODY.top + BODY.line,
        BODY.rx,
      ),
      parts: [],
    };
    for (const [key, side] of [
      ["L", -1],
      ["R", 1],
    ]) {
      for (const p of armGeom(side, o[key], o.yaw).pts)
        out.parts.push(ring(p.x, p.y, p.r + LIMB_LINE / 2));
      const leg = legGeom(side, o["leg" + key], o.yaw);
      for (const p of leg.pts)
        out.parts.push(ring(p.x, p.y, p.r + LIMB_LINE / 2));
      out.parts.push(ring(leg.a.x, leg.a.y + 2, LEG.shoeW / 2, 10));
    }
    const pivot = o.pivot ?? [100, 190];
    const a = (o.roll * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    const outer = ctx.outer,
      b = (outer.angle * Math.PI) / 180,
      bc = Math.cos(b),
      bs = Math.sin(b);
    const place = (p) => {
      const dx = p.x - pivot[0],
        dy = p.y - pivot[1];
      const x = pivot[0] + dx * c - dy * s + o.x,
        y = pivot[1] + dx * s + dy * c + o.y;
      const ex = x - FEET.x,
        ey = y - PEEK_EDGE;
      return {
        x: outer.x + ex * bc - ey * bs,
        y: outer.y + ex * bs + ey * bc,
      };
    };
    return {
      body: out.body.map(place),
      parts: out.parts.map((r) => r.map(place)),
    };
  }

  return {
    svg,
    pose,
    /** The last pose that was drawn. */
    get last() {
      return ctx.last;
    },
    /** How far toward the screen edge pose Blink is, from 0 to 1. */
    get peeking() {
      return ctx.peek;
    },
    /** Clickable outlines in screen coordinates. */
    polygons() {
      const screen = toScreen(),
        { body, parts } = shapes();
      return [body, ...parts]
        .map((poly) => poly.map(screen))
        .filter((poly) =>
          poly.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)),
        );
    },
    /** The body's bounding box on the screen. */
    bodyRect() {
      const screen = toScreen(),
        poly = shapes().body.map(screen);
      const xs = poly.map((p) => p.x),
        ys = poly.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    },
  };
}
