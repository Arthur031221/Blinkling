// Blink's motions, ported from the approved motion sheet. Each one is a function of
// time that returns a pose for drawBlink: joints only rotate, the body only moves,
// tilts or turns, and no limb ever changes length.
import { C, STAND, armGeom, clamp, ease, f1, lerp, seg } from "./rig.mjs";

export const REST = [55, 0, 8, 0];
export const UP = [150, 10, 172, 10];
export const CHEEK = [-5, 70, -60, 30];
/** The line in the drawing where a peeking Blink's hands grip the edge. */
export const PEEK_EDGE = 150;
/** How long a dizzy Blink sways before it recovers, and the fall from the air that
 * comes first, in seconds. */
const SWAY_FOR = 3.7;
const FALL_FOR = 0.3;
export const DIZZY_FOR = SWAY_FOR + FALL_FOR;
/** How long Blink takes to eat a capture, in seconds, and how long it has had the
 * mouth open before the picture is sucked in. The sheet's own clock starts when the
 * picture is shown; ours starts at the moment the mouth begins to open. */
/** The sheet's motion runs this much faster, so the card is not kept waiting. */
const EAT_SPEED = 1.8;
export const EAT_FOR = 4.2 / EAT_SPEED;
const EAT_LEAD = 0.6;
/** When, in the same clock, the gulp is over: the card may open then. */
export const EAT_SWALLOWED = (3.4 - EAT_LEAD) / EAT_SPEED;
/** How long each of the other one-off motions lasts, in seconds. */
export const APPEAR_FOR = 4.4;
export const LEAVE_FOR = 2.4;
export const TURN_FOR = 0.9;
export const FILE_FOR = 4.4;
export const CELEBRATE_FOR = 2.8;
export const SHRUG_FOR = 4;
/** How long Blink stays in the air before it is let go, once it has been spun. */
export const AIR_FOR = 2.2;
/** Seconds a pose takes to blend into the next one. */
export const BLEND = 0.45;

const wave = (t, f, a = 1, ph = 0) => Math.sin((t * f + ph) * Math.PI * 2) * a;
/** Eyes open factor with a quick blink at the given moments (seconds into a loop). */
export function blinkAt(t, ...at) {
  for (const b of at) {
    const d = t - b;
    if (d >= 0 && d < 0.2)
      return Math.max(0.08, Math.abs(Math.cos((d / 0.2) * Math.PI)));
  }
  return 1;
}
export const breath = (t, per = 3.2) =>
  -2 * (0.5 - 0.5 * Math.cos((t / per) * Math.PI * 2));

export function star4(x, y, r, fill = "#ffd25e", rot = 0) {
  const k = r * 0.32;
  return `<path transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})" d="M0 ${f1(-r)}Q${f1(k * 0.35)} ${f1(-k * 0.35)} ${f1(r)} 0Q${f1(k * 0.35)} ${f1(k * 0.35)} 0 ${f1(r)}Q${f1(-k * 0.35)} ${f1(k * 0.35)} ${f1(-r)} 0Q${f1(-k * 0.35)} ${f1(-k * 0.35)} 0 ${f1(-r)}Z" fill="${fill}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>`;
}
export const sweat = (x, y, a = 1) =>
  `<path d="M${f1(x)} ${f1(y)}q-6 9 0 12q6 -3 0 -12Z" fill="#9fd8ff" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round" opacity="${f1(a * 100) / 100}"/>`;
const mark = (x, y, s, size, fill, weight = 800) =>
  `<text x="${f1(x)}" y="${f1(y)}" font-family="system-ui,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="middle" fill="${fill}">${s}</text>`;
const padlock = (x, y) =>
  `<g transform="translate(${x} ${y})"><path d="M-6 0V-6a6 6 0 0 1 12 0V0" fill="none" stroke="${C.ink}" stroke-width="3"/><rect x="-9" y="-1" width="18" height="14" rx="3.5" fill="${C.ink}"/></g>`;

/** Standing and breathing, with a blink now and then and a glance to each side. */
export function idle(t) {
  const u = t % 6.4;
  const left = ease(seg(u, 2, 2.3)) - ease(seg(u, 3.1, 3.4));
  const right = ease(seg(u, 4.2, 4.5)) - ease(seg(u, 5.3, 5.6));
  const sw = wave(t, 1 / 3.2, 3);
  return {
    y: breath(t),
    look: [right * 0.9 - left * 0.9, 0.35],
    open: blinkAt(u, 1.2, 4.8),
    L: [55 + sw, 0, 8 + sw, 0],
    R: [55 - sw, 0, 8 - sw, 0],
  };
}

/** The greeting wave. */
export function greeting(t, k) {
  return {
    y: breath(t, 1.2),
    roll: -2,
    R: [125, 10, 160 + wave(k, 2.2, 22), 10],
    eyes: "happy",
    mouth: "open",
    mp: 0.6,
  };
}

/** Eyes and body turn toward a point; `gaze` runs from -1 to 1 on each axis. */
export function looking(t, gaze, yaw) {
  const m = Math.hypot(gaze.x, gaze.y) || 1;
  const k = Math.min(1, m);
  return {
    yaw,
    y: breath(t),
    look: [(gaze.x / m) * k, (gaze.y / m) * k],
    open: blinkAt(t % 8, 2.4, 6.1),
  };
}
/** How far the body turns toward a gazed-at point, in degrees. */
export const gazeYaw = (gaze) => clamp(gaze.x, -1, 1) * 24;

/** What each body part asks for when the pointer rests on it. */
export function touched(t, part, side, k) {
  const base = { y: breath(t), open: blinkAt(t % 8, 1.1, 7.3) };
  if (part === "head")
    return {
      ...base,
      y: -3 * Math.abs(Math.sin(k * 5)),
      eyes: "happy",
      blush: 1.25,
      mouth: "open",
      mp: 0.45,
      L: [70, 0, 30, 0],
      R: [70, 0, 30, 0],
    };
  if (part === "cheek")
    return {
      ...base,
      eyes: "squeeze",
      mouth: "o",
      mp: 0.2,
      blush: 1.45 + 0.08 * Math.sin(k * 9),
      L: CHEEK,
      R: CHEEK,
    };
  if (part === "belly")
    return {
      ...base,
      roll: 5 * Math.sin(k * 14) * (1 - 0.3 * Math.min(1, k / 2.5)),
      eyes: "happy",
      mouth: "open",
      mp: 0.8 + 0.2 * Math.sin(k * 20),
      blush: 1.2,
      L: [40, 40, -20, 40],
      R: [40, 40, -20, 40],
    };
  if (part === "hand") {
    const hi = [158, 10, 176 + 10 * Math.sin(k * 10), 15];
    return {
      ...base,
      eyes: "happy",
      mouth: "open",
      mp: 0.6,
      L: side < 0 ? hi : REST,
      R: side > 0 ? hi : REST,
      roll: -3 * side,
    };
  }
  const tap = Math.max(0, Math.sin(k * 11));
  return {
    ...base,
    look: [0.2 * side, 1],
    legL: side < 0 ? [12 * tap, 30 * tap] : [0, 0],
    legR: side > 0 ? [12 * tap, 30 * tap] : [0, 0],
    mouth: "open",
    mp: 0.3,
    L: [60, 0, 20, 0],
    R: [60, 0, 20, 0],
  };
}

/** Idle grumbling: arms hang and sway, a toe kicks the ground, eyes half closed. */
export function grumbling(t) {
  const sw = Math.sin(t * 1.7),
    kick = Math.max(0, Math.sin(t * 2.6));
  return {
    y: breath(t, 2.6),
    roll: 2.5 * sw,
    lid: 0.38,
    look: [-0.5, 0.25],
    mouth: Math.floor(t / 2.5) % 2 ? "wavy" : "flat",
    open: blinkAt(t % 8, 3.4),
    L: [30 + 6 * sw, 18 * sw, 4, 22 * sw],
    R: [30 - 6 * sw, -18 * sw, 4, -22 * sw],
    legR: [10 * kick, 34 * kick],
  };
}

/** Lifted by the scruff of its head: it dangles, kicks, flails and sweats. `k` is the
 * time since it was picked up. */
export function held(t, k, velocity = 0) {
  const lift = ease(seg(k, 0, 0.35));
  const flail = (ph) => [
    108 + 14 * Math.sin(t * 17 + ph),
    10,
    145 + 18 * Math.sin(t * 17 + ph + 1),
    10,
  ];
  const dang = (ph) => [
    6 + 6 * Math.sin(t * 9 + ph),
    22 * Math.sin(t * 9 + ph),
  ];
  const slide = (t * 0.9) % 1;
  return {
    y: -46 * lift,
    roll:
      11 * Math.sin(k * 4.3) * ease(seg(k, 0, 0.5)) +
      clamp(-velocity * 0.02, -10, 10),
    pivot: [100, 34],
    L: flail(0),
    R: flail(2),
    legL: dang(0),
    legR: dang(2.4),
    eyes: "wide",
    look: [0, 0.7],
    mouth: "wavy",
    mp: 0.4,
    attach: sweat(152, 50 + 10 * lift + 22 * slide, 1 - slide * slide),
  };
}

/** The moment after being put down. */
export function landed() {
  return {
    L: [100, 0, 130, 0],
    R: [100, 0, 130, 0],
    eyes: "squeeze",
    mouth: "o",
    mp: 0.4,
  };
}

/** Dizzy once let go after circles: spiral eyes, stars on a ring that pass in front
 * and behind, a sway that settles and a recovery. `k` is seconds since release. */
export function dizzy(since) {
  if (since < FALL_FOR)
    return {
      y: lerp(-38, 0, (since / FALL_FOR) ** 2),
      eyes: "squeeze",
      mouth: "o",
      L: UP,
      R: UP,
    };
  const k = since - FALL_FOR;
  const rec = seg(k, SWAY_FOR - 0.6, SWAY_FOR);
  const wob = (1 - rec) * (7 * Math.sin(k * 6.5));
  let front = "",
    back = "";
  if (rec < 1)
    for (let j = 0; j < 3; j++) {
      const a = k * 4 + (j * Math.PI * 2) / 3,
        depth = Math.sin(a);
      const star = star4(
        100 + Math.cos(a) * 40,
        22 + Math.sin(a) * 9,
        8 + depth * 2.5,
        "#ffd25e",
        k * 120,
      );
      if (depth < 0) back += star;
      else front += star;
    }
  return {
    roll: wob,
    x: wob * 1.2,
    eyes: rec < 0.5 ? "dizzy" : "open",
    spin: k * 360,
    mouth: rec < 0.5 ? "wavy" : "smile",
    yaw:
      k > SWAY_FOR - 0.6
        ? 16 * Math.sin((k - SWAY_FOR + 0.6) * 14) * (1 - rec)
        : 0,
    L: [70 + wob * 2, 0, 40, 0],
    R: [70 - wob * 2, 0, 40, 0],
    back,
    front,
  };
}

/** Peeking over a screen edge: both hands grip it, the head is tilted and glances
 * to each side. The edge line is PEEK_EDGE; the rest of the figure lies below it. */
export function peek(t, edge = "left") {
  const u = t % 5.6;
  const side = edge === "right" ? -1 : 1;
  const left = ease(seg(u, 1.2, 1.5)) - ease(seg(u, 2.2, 2.5));
  const right = ease(seg(u, 2.6, 2.9)) - ease(seg(u, 3.6, 3.9));
  // Above the bottom edge the head rises past the eyes and the hands lie on the line.
  const ledge = edge === "bottom";
  const arm = ledge ? [65, 0, 80, 0] : [168, 40, 20, 50];
  return {
    y: (ledge ? 26 : 36) + breath(t, 1.6) * 0.8,
    roll: ledge ? 0 : -6 * side,
    pivot: [100, 120],
    clipY: PEEK_EDGE,
    armsOver: true,
    look: [
      0.9 * (right - left) * side,
      0.1 + 0.15 * (1 - Math.abs(right - left)),
    ],
    open: blinkAt(u, 3.2),
    L: arm,
    R: arm,
  };
}

/** The mouth opens wide for what was taken, the picture is sucked in, Blink chews,
 * gulps and a sparkle follows. `k` is the time since the mouth began to open; the
 * numbers are those of the motion sheet. */
export function eating(k) {
  const t = k * EAT_SPEED + EAT_LEAD;
  const open = ease(seg(t, 0.6, 0.95)) * (1 - ease(seg(t, 2, 2.15)));
  const chew = t > 2.1 && t < 3.1;
  const swallow = t >= 3.1 && t < 3.4;
  const wide = open > 0.1;
  return {
    y: chew
      ? -1.5 * Math.abs(Math.sin(t * 12))
      : swallow
        ? -3 * Math.sin(((t - 3.1) / 0.3) * Math.PI)
        : breath(t, 1.6),
    L: wide ? [100, 30, 130, 30] : REST,
    R: wide ? [100, 30, 130, 30] : REST,
    eyes:
      t < 0.95
        ? "wide"
        : t < 2
          ? "squeeze"
          : chew || t > 3.1
            ? "happy"
            : "open",
    look: t < 0.95 ? [0.9, 0] : null,
    mouth: open > 0.05 ? "gulp" : chew ? "chew" : "smile",
    mp: open > 0.05 ? open : Math.abs(Math.sin(t * 12)),
    blush: chew ? 1.35 : 1,
    faceExtra:
      t > 3.4
        ? star4(122, 118, 5 * (1 - seg(t, 3.4, 4.4)) + 0.1, "#ffd25e", t * 90)
        : "",
  };
}

/** Dropping in from above, landing with a bounce and waving. `k` is the time since. */
export function appearing(k) {
  let y;
  if (k < 0.5) y = lerp(-240, 0, (k / 0.5) ** 2);
  else if (k < 0.9) y = -16 * Math.sin(((k - 0.5) / 0.4) * Math.PI);
  else y = 0;
  const falling = k < 0.5,
    landing = k >= 0.5 && k < 0.7,
    waving = k > 1.1 && k < 3.6;
  const legs = falling ? [12, 25] : [0, 0];
  return {
    y,
    L: falling ? UP : landing ? [95, 0, 120, 0] : REST,
    R: waving ? [125, 10, 160 + wave(k, 2.2, 22), 10] : falling ? UP : REST,
    eyes: falling ? "wide" : landing ? "squeeze" : waving ? "happy" : "open",
    mouth: falling ? "o" : waving ? "open" : "smile",
    mp: 0.6,
    legL: legs,
    legR: legs,
    open: blinkAt(k, 3.9),
  };
}

/** Waving goodbye, then jumping out of the picture. After LEAVE_FOR it is gone. */
export function leaving(k) {
  if (k > 2.3) return { y: -400, noShadow: true };
  const jump = seg(k, 1.6, 2.1);
  const y = k < 1.45 ? 0 : k < 1.6 ? 4 : lerp(0, -280, jump ** 1.6);
  const legs = k > 1.6 ? [10, 30] : [0, 0];
  return {
    y,
    L:
      k < 1.4
        ? [125, 10, 160 + wave(k, 2.2, 22), 10]
        : k < 1.6
          ? [70, 0, 40, 0]
          : UP,
    R: k < 1.6 ? REST : UP,
    eyes: k < 1.4 ? "happy" : "open",
    mouth: k < 1.4 ? "open" : "o",
    mp: 0.5,
    legL: legs,
    legR: legs,
  };
}

/** Turning to the other side: the body swings out to `dir` (1 or -1) and back, and
 * the eyes follow it. */
export function turning(k, dir = 1) {
  const yaw = 38 * dir * Math.sin(clamp(k / TURN_FOR) * Math.PI);
  return {
    yaw,
    look: [clamp(yaw / 38, -1, 1) * 0.8, 0.3],
    L: [60, 0, 10, 0],
    R: [60, 0, 10, 0],
  };
}

/** Walking sideways along an edge toward `dir` (1 or -1): legs and arms swing in
 * step, the body bobs and leans into the walk. */
export function walking(t, dir = 1) {
  const s = Math.sin(t * 2.2 * Math.PI * 2);
  return {
    yaw: 30 * dir,
    y: -2.5 * Math.abs(Math.cos(t * 2.2 * Math.PI * 2)),
    roll: 2 * dir,
    legL: [0, 40 * s * dir],
    legR: [0, -40 * s * dir],
    L: [48, -28 * s * dir, 12, -24 * s * dir],
    R: [48, 28 * s * dir, 12, 24 * s * dir],
    look: [0.75 * dir, 0.2],
    open: blinkAt(t % 6.4, 1.4, 5),
  };
}

/** Holding the pick key: turned toward the screen, one hand raised like a pointer,
 * a steady half closed gaze. */
export function picking(t) {
  return {
    x: -6,
    yaw: 18,
    y: breath(t, 2),
    R: [95, 5, 98, 0],
    L: REST,
    lid: 0.28,
    look: [0.9, 0.1],
    mouth: "smile",
    mp: 0.5,
  };
}

/** Guiding: Blink holds a pointer stick out toward the step on the screen.
 * `aim` is the unit direction from Blink to the step. The nearer arm reaches
 * that way straight, and the stick carries on from the hand along it with a
 * small ball at its end that bobs a little, as if tapping the spot. */
/** How far the stick reaches past the hand: long enough to clear the card's
 * tail and be seen pointing, not just a stub at Blink's side. */
export const STICK = 84;
export function guiding(t, aim) {
  const len = Math.hypot(aim.x, aim.y) || 1,
    dx = aim.x / len,
    dy = aim.y / len;
  const side = dx >= 0 ? 1 : -1;
  const abd = (Math.atan2(side * dx, dy) * 180) / Math.PI;
  const reach = [abd, 0, abd, 0];
  const { tip } = armGeom(side, reach, 0);
  const tap = 1 + 0.12 * Math.sin(t * 6),
    sx = tip.x + dx * STICK * tap,
    sy = tip.y + dy * STICK * tap;
  const stick = `<g class="guide-stick" stroke-linecap="round"><path d="M${f1(tip.x)} ${f1(tip.y)}L${f1(sx)} ${f1(sy)}" stroke="${C.ink}" stroke-width="6.4"/><path d="M${f1(tip.x)} ${f1(tip.y)}L${f1(sx)} ${f1(sy)}" stroke="#f1c75b" stroke-width="3"/></g><circle cx="${f1(sx)}" cy="${f1(sy)}" r="5" fill="#e4574f" stroke="${C.ink}" stroke-width="2.4"/>`;
  return {
    x: 0,
    yaw: 0,
    y: breath(t, 2),
    R: side > 0 ? reach : REST,
    L: side > 0 ? REST : reach,
    lid: 0.1,
    look: [dx, dy],
    mouth: "smile",
    mp: 0.5,
    attach: stick,
  };
}

const sheet = (x, y, rot, op) =>
  `<g opacity="${f1(op * 100) / 100}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)} 0 18)"><path d="M-14 -18H6L14 -10V18H-14Z" fill="#fff" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><path d="M6 -18V-10H14" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/><path d="M-8 -4H8M-8 3H8M-8 10H4" stroke="#b9c4bd" stroke-width="2.6" stroke-linecap="round"/></g>`;

/** A file dropped on Blink: it looks up with open hands, the sheet lands on its
 * head and it sways under it, pleased. `k` is the time since the drop. */
export function fileCaught(k) {
  const fall = seg(k, 0.5, 1.15),
    landed = k >= 1.15;
  const bounce =
    landed && k < 1.45 ? -7 * Math.sin(((k - 1.15) / 0.3) * Math.PI) : 0;
  const fy = landed ? 14 + bounce : lerp(-90, 14, fall * fall);
  const tilt = landed
    ? 7 * Math.sin((k - 1.15) * 5) * (1 - seg(k, 3.2, 3.8))
    : 0;
  const op = 1 - seg(k, 3.8, 4.3);
  const ready = [112, 20, 150, 20];
  return {
    y:
      landed && k < 1.4
        ? 3 * Math.sin(((k - 1.15) / 0.25) * Math.PI)
        : breath(k, 1.8),
    L: landed ? [150, 10, 168 + wave(k, 2.5, 8), 10] : ready,
    R: landed ? [150, 10, 168 - wave(k, 2.5, 8), 10] : ready,
    eyes: landed ? "happy" : "wide",
    look: [0, -1],
    mouth: landed ? "open" : "o",
    mp: landed ? 0.6 : 0.5,
    attach: sheet(100, fy, tilt, op),
    roll: landed ? tilt * -0.3 : 0,
    pivot: [100, 190],
  };
}

/** A long answer or task is done: a jump with both hands up and a burst of stars. */
export function celebrating(k) {
  let y = 0;
  if (k < 0.85) y = -40 * Math.sin((k / 0.85) * Math.PI);
  else if (k > 1.1 && k < 1.6) y = -14 * Math.sin(((k - 1.1) / 0.5) * Math.PI);
  const air = y < -2,
    burst = seg(k, 0.25, 1.1);
  let front = "";
  if (burst > 0 && burst < 1)
    for (let j = 0; j < 5; j++) {
      const a = -Math.PI / 2 + (j - 2) * 0.62,
        r = 70 + burst * 34;
      front += star4(
        100 + Math.cos(a) * r,
        98 + Math.sin(a) * r * 0.9,
        7 * (1 - burst) + 1,
        j % 2 ? "#8ff0c2" : "#ffd25e",
        burst * 160,
      );
    }
  const legs = air ? [12, 32] : [0, 0];
  return {
    y,
    L: [150, 10, 172 + wave(k, 3, 7), 10],
    R: [150, 10, 172 - wave(k, 3, 7), 10],
    eyes: "happy",
    mouth: "open",
    mp: 1,
    legL: legs,
    legR: legs,
    front,
  };
}

const OUT = [80, 15, 140, 15];
const mixArm = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
/** Nothing found, no answer: it spreads its hands, looks left and right, and the
 * question marks float up. */
export function shrugging(k) {
  const u = ease(seg(k, 0.2, 0.5)) * (1 - ease(seg(k, 3.4, 3.8)));
  const arms = mixArm(REST, OUT, u);
  return {
    y: u > 0.9 && k < 0.8 ? -4 : breath(k, 2),
    roll: 3 * Math.sin(k * 1.6) * u,
    L: arms,
    R: arms,
    look: [k < 2 ? -0.8 : 0.8, -0.2],
    mouth: u > 0.5 ? "flat" : "smile",
    open: blinkAt(k, 1.9),
    front:
      u > 0.2
        ? `<g opacity="${f1(u * 100) / 100}">${mark(150, 30 - 4 * Math.sin(k * 3), "?", 26, "#18a866")}${mark(52, 40 - 4 * Math.cos(k * 3), "?", 18, "#18a866")}</g>`
        : "",
  };
}

/** Swung round in the air: it goes in circles, eyes shut, hands up, until it is let
 * go. `k` is the time since the second loop was closed. */
export function whirled(k) {
  const a = (k / 1.1) * Math.PI * 2;
  return {
    x: 34 * Math.cos(a),
    y: -38 + 16 * Math.sin(a),
    roll: 14 * Math.sin(a + Math.PI / 2),
    pivot: [100, 34],
    eyes: "squeeze",
    mouth: "o",
    mp: 0.5,
    L: [118, 10, 150, 10],
    R: [118, 10, 150, 10],
    legL: [14, 20 * Math.sin(a)],
    legR: [14, -20 * Math.sin(a)],
  };
}

/** The pose each face of the session asks for. */
export function facePose(face, t) {
  switch (face) {
    case "lock":
      return {
        eyes: "closed",
        mouth: "flat",
        attach: padlock(150, 50),
      };
    case "permission": {
      const q = `<g transform="translate(150 22) rotate(${f1(wave(t, 1.2, 8))})">${mark(0, 0, "?", 30, "#18a866")}</g>`;
      return {
        y: breath(t, 1.6),
        R: [170, 6 + wave(t, 1.6, 6), 178 + wave(t, 3.2, 8), 6],
        L: REST,
        look: [0, 0.15],
        mouth: "open",
        mp: 0.35,
        open: blinkAt(t % 8, 2.2),
        front: q,
      };
    }
    case "usage-limit": {
      const zs = [0, 1, 2]
        .map((j) => {
          const k = (t / 2 + j / 3) % 1;
          return `<g opacity="${f1((1 - k) * 100) / 100}">${mark(150 + k * 30 + j * 2, 60 - k * 46, "z", 11 + k * 12, C.ink)}</g>`;
        })
        .join("");
      const br = wave(t, 1 / 3);
      return {
        y: 12 + 1.2 * br,
        roll: 4,
        pivot: [100, 190],
        eyes: "closed",
        mouth: "o",
        mp: 0.1 + 0.08 * br,
        blush: 0.95,
        legL: [6, 85, 12],
        legR: [6, 85, 12],
        L: [32, 22, 6, 30],
        R: [32, 22, 6, 30],
        front: zs,
      };
    }
    case "error": {
      const shiver = t % 4 > 0.2 && t % 4 < 1 ? 0.9 * Math.sin(t * 90) : 0;
      const bang = `<g transform="translate(160 28)"><circle r="13" fill="#ff7a6b" stroke="${C.ink}" stroke-width="2.6"/>${mark(0, 6, "!", 18, "#fff")}</g>`;
      return {
        x: shiver,
        eyes: "wide",
        look: [0, 0.6],
        lid: 0.12,
        lidTilt: -5,
        mouth: "wavy",
        L: CHEEK,
        R: CHEEK,
        attach: sweat(
          150,
          54 + 18 * seg(t % 4, 0.4, 2.6),
          1 - seg(t % 4, 2.6, 3),
        ),
        front: bang,
        open: blinkAt(t % 8, 2.8),
      };
    }
    case "thinking": {
      const dots = [0, 1, 2]
        .map((j) => {
          const on = (((t * 1.2 - j * 0.33) % 1) + 1) % 1 < 0.6;
          return `<circle cx="${148 + j * 15}" cy="${46 - j * 14}" r="${4 + j * 1.6}" fill="#fff" stroke="${C.ink}" stroke-width="2.6" opacity="${on ? 1 : 0.25}"/>`;
        })
        .join("");
      return {
        y: breath(t, 2),
        roll: -4 + wave(t, 0.25, 2),
        L: [-35, 45, -95, 25],
        R: REST,
        look: [0.6, -0.75],
        mouth: "flat",
        open: blinkAt(t % 8, 2.9),
        front: dots,
      };
    }
    case "talking": {
      const mp =
        0.25 +
        0.75 * Math.abs(Math.sin(t * 13)) * (0.6 + 0.4 * Math.sin(t * 3.1));
      return {
        y: breath(t, 1.6),
        mouth: "talk",
        mp,
        R: REST,
        L: [78 + 12 * Math.sin(t * 2.4), 18, 112 + 10 * Math.sin(t * 2.4), 10],
        open: blinkAt(t % 8, 1.8, 4.3),
        look: [0.25, 0.2],
      };
    }
    case "watching":
      return {
        look: [Math.sin(t * 2.2) * 0.9, 0.1],
        eyes: "wide",
        y: breath(t, 2.4),
      };
    default:
      return {};
  }
}

const NUMBERS = [
  "x",
  "y",
  "roll",
  "yaw",
  "open",
  "lid",
  "lidTilt",
  "mp",
  "blush",
  "spin",
];
const VECTORS = ["L", "R", "pivot"];
const LEGS = ["legL", "legR"];
const FACES = ["eyes", "mouth"];
const LOOK = [0.55, 0.6];
const pad = (v, n) => Array.from({ length: n }, (_, i) => v?.[i] ?? 0);

/** Blend two poses: numbers and joint angles move smoothly, face shapes swap
 * halfway and drawings that belong to the target appear with it. */
export function blendPose(a, b, k) {
  const base = { ...STAND, pivot: [100, 190], lidTilt: 0, spin: 0 };
  const A = { ...base, ...a },
    B = { ...base, ...b };
  const out = { ...B };
  for (const key of NUMBERS) out[key] = lerp(A[key], B[key], k);
  for (const key of VECTORS)
    out[key] = A[key].map((v, i) => lerp(v, B[key][i], k));
  for (const key of LEGS)
    out[key] = pad(A[key], 3).map((v, i) => lerp(v, pad(B[key], 3)[i], k));
  for (const key of FACES) out[key] = k < 0.5 ? A[key] : B[key];
  const la = A.look ?? LOOK,
    lb = B.look ?? LOOK;
  out.look = la.map((v, i) => lerp(v, lb[i], k));
  if (!A.look && !B.look) out.look = null;
  return out;
}
