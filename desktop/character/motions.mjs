// Blink's motions, ported from the approved motion sheet. Each one is a function of
// time that returns a pose for drawBlink: joints only rotate, the body only moves,
// tilts or turns, and no limb ever changes length.
import { C, STAND, clamp, ease, f1, lerp, seg } from "./rig.mjs";

export const REST = [55, 0, 8, 0];
export const UP = [150, 10, 172, 10];
export const CHEEK = [-5, 70, -60, 30];
/** The line in the drawing where a peeking Blink's hands grip the edge. */
export const PEEK_EDGE = 150;
/** How long a dizzy Blink sways before it recovers, in seconds. */
export const DIZZY_FOR = 3.7;
/** How long Blink's reaction to catching a pick lasts, in seconds. */
export const CATCH_FOR = 1.1;
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
export function dizzy(k) {
  const rec = seg(k, DIZZY_FOR - 0.6, DIZZY_FOR);
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
      k > DIZZY_FOR - 0.6
        ? 16 * Math.sin((k - DIZZY_FOR + 0.6) * 14) * (1 - rec)
        : 0,
    L: [70 + wob * 2, 0, 40, 0],
    R: [70 - wob * 2, 0, 40, 0],
    back,
    front,
  };
}

/** Peeking over a screen edge: both hands grip it, the head is tilted and glances
 * to each side. The edge line is PEEK_EDGE; the rest of the figure lies below it. */
export function peek(t) {
  const u = t % 5.6;
  const left = ease(seg(u, 1.2, 1.5)) - ease(seg(u, 2.2, 2.5));
  const right = ease(seg(u, 2.6, 2.9)) - ease(seg(u, 3.6, 3.9));
  return {
    y: 36 + breath(t, 1.6) * 0.8,
    roll: -6,
    pivot: [100, 120],
    clipY: PEEK_EDGE,
    armsOver: true,
    look: [0.9 * (right - left), 0.1 + 0.15 * (1 - Math.abs(right - left))],
    open: blinkAt(u, 3.2),
    L: [168, 40, 20, 50],
    R: [168, 40, 20, 50],
  };
}

/** The mouth opens wide for what was picked, chews, and swallows. `k` is the time
 * since the catch. */
export function catching(t, k) {
  const gulp = Math.max(0, 1 - k / 0.22);
  const chew = k < 0.22 ? 0 : Math.sin((k - 0.22) * 26) * Math.exp(-k * 2.2);
  const settle = Math.exp(-k * 2.2);
  return {
    y: -Math.abs(Math.sin(k * 14)) * settle * 12,
    L: [100, 30, 130, 30],
    R: [100, 30, 130, 30],
    eyes: gulp > 0 ? "wide" : "happy",
    look: gulp > 0 ? [0.9, 0] : null,
    mouth: gulp > 0 ? "gulp" : "chew",
    mp: gulp > 0 ? 0.55 + gulp * 0.45 : Math.abs(chew) * 1.2,
    blush: 1.35,
    faceExtra:
      k > CATCH_FOR - 0.4
        ? star4(
            122,
            118,
            5 * (1 - seg(k, CATCH_FOR - 0.4, CATCH_FOR)) + 0.1,
            "#ffd25e",
            t * 90,
          )
        : "",
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
