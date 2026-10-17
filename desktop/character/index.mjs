import {
  BODY,
  D2R,
  FACE,
  LIMB_LINE,
  STAND,
  armGeom,
  boxPolygon,
  clamp,
  drawBlink,
  ease,
  f1,
  lerp,
  legGeom,
  shoeShape,
  silhouette,
} from "./rig.mjs";
import {
  APPEAR_FOR,
  BLEND,
  CELEBRATE_FOR,
  DIZZY_FOR,
  EAT_FOR,
  FILE_FOR,
  PEEK_EDGE,
  SHRUG_FOR,
  TURN_FOR,
  appearing,
  blendPose,
  celebrating,
  dizzy,
  eating,
  fileCaught,
  facePose,
  gazeYaw,
  grumbling,
  held,
  idle,
  landed,
  leaving,
  looking,
  peek,
  picking,
  guiding,
  shrugging,
  touched,
  turning,
  walking,
  whirled,
  greeting,
} from "./motions.mjs";
import {
  COSTUME_FOR,
  costumeMove,
  costumeOutfit,
  moveFor,
} from "./costume.mjs";
import { edgeTransform, poseTransform } from "./transform.mjs";
import { BLINK_SCALE as K } from "./size.mjs";
import { clipAbove, roundedRect } from "./silhouette.mjs";
export { COSTUME_FOR, DIZZY_FOR, EAT_FOR };
/** How far outside its drawn shape Blink still takes a click, hover or press. */
export const HIT_MARGIN = 6;

/** The box the renderer gives Blink, and where its feet stand in it. The drawing is
 * 200 units wide; K pixels to the unit, with the feet at (100, 190) in the drawing
 * on the box's foot point. */
export const BOX = Object.freeze({
  width: 148,
  height: 152,
  footX: 74,
  footY: 142,
});
/** How far, in drawing units, a pointer may miss a cheek and still touch it: the
 * cheeks are small, and they lie on the body, so nothing undrawn is reached. */
const TOUCH_REACH = 4;
/** The face and the body above it end here; the belly is below. */
const FACE_BOTTOM = 106;
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
const SCENE = ["front", "back", "attach", "faceExtra", "behind"];
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
    rest: null,
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
    if (o.leaveAt != null && time >= o.leaveAt)
      return {
        key: "leave",
        pose: plain(leaving(time - o.leaveAt)),
        blend: 0.15,
      };
    if (o.mode === "drag") {
      if (ctx.dragAt < 0) ctx.dragAt = time;
      const spun = time - (o.whirlAt ?? Infinity);
      return spun >= 0
        ? { key: "whirl", pose: whirled(spun), blend: 0.25 }
        : {
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
    const came = time - (o.appearAt ?? -100);
    if (came >= 0 && came < APPEAR_FOR)
      return { key: "appear", pose: plain(appearing(came)), blend: 0.1 };
    const ate = time - (o.eatAt ?? -100);
    if (ate >= 0 && ate < EAT_FOR)
      return { key: "eat", pose: plain(eating(ate)), blend: 0.12 };
    const filed = time - (o.fileAt ?? -100);
    if (filed >= 0 && filed < FILE_FOR)
      return { key: "file", pose: plain(fileCaught(filed)), blend: 0.15 };
    const cheered = time - (o.celebrateAt ?? -100);
    if (cheered >= 0 && cheered < CELEBRATE_FOR)
      return {
        key: "celebrate",
        pose: plain(celebrating(cheered)),
        blend: 0.1,
      };
    const shrugged = time - (o.shrugAt ?? -100);
    if (shrugged >= 0 && shrugged < SHRUG_FOR)
      return { key: "shrug", pose: plain(shrugging(shrugged)), blend: 0.2 };
    const turned = time - (o.turnAt ?? -100);
    if (turned >= 0 && turned < TURN_FOR)
      return {
        key: "turn",
        pose: plain(turning(turned, o.turnDir ?? 1)),
        blend: 0.12,
      };
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
    const dressed = time - (o.costumeAt ?? -100);
    if (o.costume && dressed >= 0 && dressed < moveFor(o.costume.effort))
      return {
        key: `costume:${o.costume.effort}`,
        pose: plain(
          costumeMove(o.costume.effort, dressed, o.costume.reduced === true),
        ),
        blend: 0.2,
      };
    const waved = time - (o.waveAt ?? -100);
    if (waved >= 0 && waved < 1.5)
      return { key: "wave", pose: plain(greeting(time, waved)), blend: 0.3 };
    if (o.walking)
      return {
        key: "walk",
        pose: plain(walking(time, o.walking)),
        blend: 0.2,
      };
    if (o.guideAim) {
      return {
        key: "guide",
        pose: plain(guiding(time, o.guideAim)),
        blend: 0.18,
      };
    }
    if (o.picking) {
      const g = o.gaze;
      const m = g ? Math.hypot(g.x, g.y) || 1 : 1;
      return {
        key: "pick",
        pose: plain({
          ...picking(time),
          ...(g ? { look: [g.x / m, g.y / m] } : {}),
        }),
        blend: 0.25,
      };
    }
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
      // The edge hides the rest of Blink only once it is gripping it; the blend
      // would otherwise carry the peek's clip line into the whole turn.
      delete out.clipY;
      if (lean > 0.4)
        out.clipY = lerp(320, PEEK_EDGE, ease((lean - 0.4) / 0.6));
      out.armsOver = lean > 0.5;
      if (lean > 0.5) out.back = "";
    }
    // The outfit stays on for its whole time, whatever Blink is doing.
    const worn = o.costume
      ? costumeOutfit(o.costume.family, time - (o.costumeAt ?? -100))
      : null;
    if (worn && lean < 0.5) {
      out.behind = worn.behind;
      out.faceExtra = (out.faceExtra ?? "") + worn.faceExtra;
      out.front = (out.front ?? "") + worn.front;
      out.attach = (out.attach ?? "") + worn.attach;
    }
    out.attach = (out.attach ?? "") + dotSvg(o.dot);
    out.noShadow = true;
    ctx.last = out;
    if (!ctx.key?.startsWith("touch:")) ctx.rest = out;
    const edge = EDGES[ctx.edge];
    ctx.outer = {
      angle: lerp(0, edge.angle, ease(lean)),
      x: lerp(FEET.x, edge.x, ease(lean)),
      y: lerp(PEEK_EDGE, edge.y, ease(lean)),
    };
    const frame = `<g transform="${edgeTransform(ctx.outer, FEET.x, PEEK_EDGE).svg}">${drawBlink(out, "b")}</g>`;
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
   * moved and tilted the figure, the edge has hidden what lies behind it and the
   * edge has turned it. Only what is drawn counts: the body outline, the arms, the
   * legs and the shoes. */
  function shapes(drawn = ctx.last) {
    const o = { ...STAND, ...drawn };
    const sil = silhouette(o.yaw);
    const half = BODY.line / 2;
    const body = boxPolygon(
      sil.x1 - half,
      sil.x2 + half,
      BODY.top - half,
      BODY.bottom + half,
    );
    const parts = [];
    for (const [key, side] of [
      ["L", -1],
      ["R", 1],
    ]) {
      for (const p of armGeom(side, o[key], o.yaw).pts)
        parts.push(ring(p.x, p.y, p.r + LIMB_LINE / 2));
      const leg = legGeom(side, o["leg" + key], o.yaw);
      for (const p of leg.pts) parts.push(ring(p.x, p.y, p.r + LIMB_LINE / 2));
      const shoe = shoeShape(leg, o.yaw),
        turn = (shoe.rot * Math.PI) / 180;
      parts.push(
        roundedRect(
          -shoe.w / 2 + shoe.toe,
          -shoe.h / 2,
          shoe.w,
          shoe.h,
          shoe.h / 2,
        ).map((v) => ({
          x: shoe.cx + v.x * Math.cos(turn) - v.y * Math.sin(turn),
          y: shoe.cy + v.x * Math.sin(turn) + v.y * Math.cos(turn),
        })),
      );
    }
    // The parts a pointer can touch, each with the part and side it means.
    const named = [];
    const faceX = (x) =>
      BODY.cx -
      BODY.cx * sil.c +
      (BODY.d / 2) * Math.sin(o.yaw * D2R) +
      x * sil.c;
    FACE.blushX.forEach((bx, i) => {
      const k = Math.max(o.blush ?? 1, 1),
        cx = faceX(bx),
        rx = 11 * k * sil.c + TOUCH_REACH,
        ry = 6.5 * k + TOUCH_REACH;
      named.push({
        part: "cheek",
        side: i ? 1 : -1,
        poly: ring(0, 0, 1, 16).map((v) => ({
          x: cx + v.x * rx,
          y: FACE.blushY + v.y * ry,
        })),
      });
    });
    const sides = [-1, 1];
    sides.forEach((side, i) => {
      for (const p of armGeom(side, o[i ? "R" : "L"], o.yaw).pts)
        named.push({
          part: "hand",
          side,
          poly: ring(p.x, p.y, p.r + LIMB_LINE / 2),
        });
    });
    const flip = (poly) => poly.map((v) => ({ x: v.x, y: -v.y }));
    named.push(
      { part: "head", side: 0, poly: clipAbove(body, FACE_BOTTOM) },
      {
        part: "belly",
        side: 0,
        poly: flip(clipAbove(flip(body), -FACE_BOTTOM)),
      },
    );
    sides.forEach((side, i) => {
      const leg = legGeom(side, o[i ? "legR" : "legL"], o.yaw);
      for (const p of leg.pts)
        named.push({
          part: "foot",
          side,
          poly: ring(p.x, p.y, p.r + LIMB_LINE / 2),
        });
      const shoe = shoeShape(leg, o.yaw),
        turn = shoe.rot * D2R;
      named.push({
        part: "foot",
        side,
        poly: roundedRect(
          -shoe.w / 2 + shoe.toe,
          -shoe.h / 2,
          shoe.w,
          shoe.h,
          shoe.h / 2,
        ).map((v) => ({
          x: shoe.cx + v.x * Math.cos(turn) - v.y * Math.sin(turn),
          y: shoe.cy + v.x * Math.sin(turn) + v.y * Math.cos(turn),
        })),
      });
    });
    const pose = poseTransform(o).apply;
    const turned = edgeTransform(ctx.outer, FEET.x, PEEK_EDGE).apply;
    const place = (poly) => {
      const moved = poly.map(pose);
      return (o.clipY != null ? clipAbove(moved, o.clipY) : moved).map(turned);
    };
    return {
      body: place(body),
      parts: parts.map(place),
      named: named.map((n) => ({ ...n, poly: place(n.poly) })),
    };
  }

  const within = (poly, p) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const u = poly[i],
        v = poly[j];
      if (
        u.y > p.y !== v.y > p.y &&
        p.x < ((v.x - u.x) * (p.y - u.y)) / (v.y - u.y) + u.x
      )
        hit = !hit;
    }
    return hit;
  };
  const partsAt = (point, drawn) => {
    const screen = toScreen();
    return shapes(drawn)
      .named.map((n) => ({ ...n, poly: n.poly.map(screen) }))
      .filter((n) => n.poly.length > 2 && within(n.poly, point));
  };

  /** Where a point of the drawing lands once the pose and the edge have placed
   * Blink: the same two transforms the drawing is written with. */
  function figurePoint(p, drawn = ctx.last) {
    const o = { ...STAND, ...drawn };
    return edgeTransform(ctx.outer, FEET.x, PEEK_EDGE).apply(
      poseTransform(o).apply(p),
    );
  }

  return {
    svg,
    pose,
    figurePoint,
    /** The last pose that was drawn. */
    get last() {
      return ctx.last;
    },
    /** How far toward the screen edge pose Blink is, from 0 to 1. */
    get peeking() {
      return ctx.peek;
    },
    /** Clickable outlines in screen coordinates. */
    /** The part of Blink under a screen point, as it is drawn now: where the
     * pose put it, at the scale and turn of the edge it grips. Where a reaction
     * moved its part away from the pointer, the part stays touched while the
     * pointer is where it rested. */
    touchAt(point) {
      const now = partsAt(point, ctx.last)[0];
      const held = ctx.key?.startsWith("touch:") ? ctx.key.slice(6) : null;
      const rest = now
        ? null
        : held &&
          partsAt(point, ctx.rest).find((n) => n.part + n.side === held);
      const hit = now ?? rest;
      return hit ? { part: hit.part, side: hit.side } : null;
    },
    /** Which pose is playing now (held, dizzy, eat, walk...). */
    key: () => ctx.key,
    polygons() {
      const screen = toScreen(),
        { body, parts } = shapes();
      return [body, ...parts]
        .map((poly) => poly.map(screen))
        .filter(
          (poly) =>
            poly.length > 2 &&
            poly.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)),
        );
    },
    /** Each touchable part as a polygon on the screen, for the debug view. */
    partShapes() {
      const screen = toScreen();
      return shapes().named.map((n) => ({
        part: n.part,
        side: n.side,
        poly: n.poly.map(screen),
      }));
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
