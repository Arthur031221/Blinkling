// The five effort shows, one per level, each a one-off performance with small
// props and more energy than the one before: a tea break, juggling, a weight lift,
// a guitar solo, a rocket launch. A show is a function of `k`, the seconds since it
// began. The model's piece stays on while it plays (the character adds it), and
// `bounds` lists the boxes the props fill at that moment, for the window shape.
import { C, armGeom, ease, f1, lerp, seg } from "./rig.mjs";
import {
  around,
  box,
  burst,
  moved,
  note,
  phase,
  prop,
  pulse,
  scaled,
  starRing,
  stroke,
} from "./costume-art.mjs";

export const SHOW_FOR = { low: 2.2, medium: 2.6, high: 3, xhigh: 3.4, max: 4 };
const REST = [55, 0, 8, 0];
const wave = (t, f, a = 1) => Math.sin(t * f * Math.PI * 2) * a;
const hand = (side, arm) => {
  const t = armGeom(side, arm, 0).tip;
  return { x: t.x, y: t.y };
};
const mixArm = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

// ---------------------------------------------------------------- low
// A tea break: eyes close, Blink sips from a small cup, steam curls.
function low(k) {
  const raise = phase(k, 0, 0.4) * (1 - phase(k, 1.8, 2.15));
  const sip = pulse(k, 0.45, 1.05) + pulse(k, 1.1, 1.6);
  const arm = mixArm(REST, [-30, 70, -70, 60], raise);
  const h = hand(1, arm);
  const tilt = -22 * Math.min(1, sip);
  const cup = moved(
    `<path d="M-12 -10L12 -10L9 10Q0 15 -9 10Z" fill="${C.white}" ${stroke(2.6)}/><path d="M12 -6Q22 -6 21 2Q20 8 10 6" fill="none" ${stroke(2.6)}/><path d="M-10 -6H10" fill="none" stroke="#b9743f" stroke-width="3" stroke-linecap="round"/>`,
    h.x + 6 - 6 * Math.min(1, sip),
    h.y - 12,
    tilt,
    1,
  );
  let steam = "";
  if (raise > 0.6)
    for (let i = 0; i < 3; i++) {
      const t = (k * 0.8 + i / 3) % 1;
      const x = h.x + 8 + (i - 1) * 8 + Math.sin(t * 9 + i) * 3;
      const y = h.y - 30 - t * 34;
      steam += `<path d="M${f1(x)} ${f1(y)}q6 -6 0 -12t0 -12" fill="none" stroke="#dfe6e3" stroke-width="3.2" stroke-linecap="round" opacity="${f1(1 - t)}"/>`;
    }
  const bounds =
    raise > 0.02 ? [box(h.x - 30, h.y - 82, h.x + 36, h.y + 18)] : [];
  return {
    y: 2 * Math.sin(k * 3),
    L: REST,
    R: arm,
    eyes: raise > 0.5 ? "closed" : "open",
    mouth: sip > 0.4 ? "o" : "smile",
    mp: 0.25,
    blush: 1.2,
    attach: raise > 0.02 ? prop(scaled(cup + steam, h.x, h.y, raise)) : "",
    bounds,
  };
}

// ---------------------------------------------------------------- medium
// Juggling: three balls arc between the hands in a steady rhythm.
function medium(k) {
  const on = phase(k, 0, 0.3) * (1 - phase(k, 2.25, 2.55));
  const flick = Math.sin((k / 0.9) * Math.PI);
  const armL = [76 + 4 * flick, 30, 100, 20];
  const armR = [76 - 4 * flick, 30, 100, 20];
  const hl = hand(-1, armL),
    hr = hand(1, armR);
  const colors = ["#ee6a56", "#ffd25e", "#4f9cf0"];
  let balls = "";
  for (let i = 0; i < 3; i++) {
    const ph = (k / 0.9 + (i * 2) / 3) % 2;
    const f = Math.floor(ph),
      q = ph - f;
    const from = f % 2 === 0 ? hl : hr,
      to = f % 2 === 0 ? hr : hl;
    const x = lerp(from.x, to.x, q);
    const y = lerp(from.y, to.y, q) - 4 * q * (1 - q) * (130 + 6 * i);
    balls += `<circle cx="${f1(x)}" cy="${f1(y - 8)}" r="${f1(10 * on)}" fill="${colors[i]}" ${stroke(2.4)}/><path d="M${f1(x - 3)} ${f1(y - 12)}q3 -3 6 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8" transform="translate(0 ${f1(2)})"/>`;
  }
  const catchL = Math.abs(Math.sin((k / 0.9) * Math.PI));
  return {
    y: -3 * catchL * on,
    L: armL,
    R: armR,
    legL: [0, 6],
    legR: [0, 6],
    eyes: "open",
    look: [Math.sin((k / 0.9) * Math.PI * 2) * 0.7, -0.5],
    mouth: "open",
    mp: 0.3,
    attach: prop(balls),
    bounds: [box(hl.x - 24, -50, hr.x + 24, hr.y + 14)],
  };
}

// ---------------------------------------------------------------- high
// A weight lift: a barbell comes up from the ground, wide stance, two reps, the
// ground shakes where it lands.
function high(k) {
  const appear = phase(k, 0, 0.3) * (1 - phase(k, 2.8, 3));
  // `h`: 0 = at the hips, 1 = overhead. Two presses, a hold, then down.
  const press1 = phase(k, 0.7, 1.15) * (1 - phase(k, 1.15, 1.5));
  const press2 = phase(k, 1.5, 1.95);
  const hold = k > 1.95 && k < 2.4 ? 1 : 0;
  const lower = phase(k, 2.4, 2.65);
  const h = Math.max(press1, press2 * (1 - lower));
  const toHips = phase(k, 0.3, 0.7) * (1 - lower);
  const arm = mixArm(REST, [150, 0, 150, 0], h);
  const hl = hand(-1, arm);
  const floorY = 166;
  const grab = 6;
  const barY = lerp(floorY, hl.y + grab, toHips);
  const stance = 24 * phase(k, 0.2, 0.6) * (1 - phase(k, 2.7, 3));
  const landing = Math.max(pulse(k, 0.0, 0.3), pulse(k, 2.4, 2.8));
  const shake = landing > 0.05 ? wave(k, 22, 2.5 * landing) : 0;
  const plate = (cx) => {
    const in_ = cx < 100 ? 1 : -1;
    return (
      `<ellipse cx="${cx}" cy="${f1(barY)}" rx="11" ry="33" fill="#3b6fd6" ${stroke(2.8)}/>` +
      `<ellipse cx="${cx + in_ * 12}" cy="${f1(barY)}" rx="8" ry="25" fill="#ffd25e" ${stroke(2.6)}/>`
    );
  };
  const bar = `<path d="M4 ${f1(barY)}H196" fill="none" ${stroke(7)}/><path d="M4 ${f1(barY)}H196" fill="none" stroke="#cfd5da" stroke-width="3.4" stroke-linecap="round"/>${plate(12)}${plate(188)}`;
  let dust = "";
  if (landing > 0.05)
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const t = (k * 3 + i * 0.13) % 1;
      dust += `<circle cx="${f1(100 + side * (50 + 34 * t + i * 5))}" cy="${f1(186 - 8 * t - (i % 3) * 3)}" r="${f1(6 + 6 * t)}" fill="#e8e5dc" ${stroke(1.8)} opacity="${f1(landing * (1 - t * 0.6))}"/>`;
    }
  // Sweat flies off at the top of each press.
  const strain = Math.max(press1, press2, hold);
  let sweatDrops = "";
  if (strain > 0.5)
    for (let i = 0; i < 3; i++) {
      const t = (k * 2 + i / 3) % 1;
      sweatDrops += `<path transform="translate(${f1(34 + i * 4 - t * 16)} ${f1(60 + t * 40)})" d="M0 0q-4 6 0 8q4 -2 0 -8Z" fill="#9fd8ff" ${stroke(1.8)} opacity="${f1(1 - t)}"/>`;
      sweatDrops += `<path transform="translate(${f1(160 - i * 4 + t * 16)} ${f1(62 + t * 40)})" d="M0 0q-4 6 0 8q4 -2 0 -8Z" fill="#9fd8ff" ${stroke(1.8)} opacity="${f1(1 - t)}"/>`;
    }
  const bounds = appear > 0.02 ? [box(-8, barY - 36, 208, 196)] : [];
  if (strain > 0.5) bounds.push(box(8, 40, 192, 120));
  return {
    x: shake,
    y: 3 * toHips - 2 * h,
    L: arm,
    R: arm,
    legL: [0, stance],
    legR: [0, stance],
    eyes: strain > 0.3 ? "closed" : "open",
    mouth: strain > 0.3 ? "open" : "smile",
    mp: 0.35 + 0.5 * strain,
    blush: 1.3,
    back: prop(scaled(bar, 100, barY, Math.max(appear, 0.01))),
    mid: prop(dust),
    front: prop(sweatDrops),
    bounds,
  };
}

// ---------------------------------------------------------------- xhigh
// A guitar solo: an electric guitar, head banging, lightning flickering, notes
// bursting out.
function xhigh(k) {
  const on = phase(k, 0, 0.3) * (1 - phase(k, 3.1, 3.4));
  const bang = wave(k, 3.2, 1) * on;
  const strum = Math.sin(k * Math.PI * 14);
  const guitar = moved(
    `<path d="M-62 -26L-10 -4" fill="none" stroke="#6b4423" stroke-width="12" stroke-linecap="round"/><path d="M-62 -26L-10 -4" fill="none" stroke="${C.ink}" stroke-width="3" transform="translate(0 -6)" opacity="0"/>` +
      `<path d="M-72 -34l-14 -8l4 -8l14 8Z" fill="#3a2a1c" ${stroke(2.4)}/>` +
      `<path d="M-12 -22Q8 -34 22 -20Q40 -14 36 6Q34 28 8 30Q-14 32 -20 14Q-30 4 -12 -22Z" fill="#d93d4e" ${stroke()}/>` +
      `<circle cx="6" cy="4" r="5" fill="#2a2e35" ${stroke(2)}/><path d="M-6 16H26M-4 22H24" fill="none" stroke="#2a2e35" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M-10 -4L14 6" fill="none" stroke="#e8e8e0" stroke-width="2.2" opacity=".9"/>`,
    112,
    156,
    -8,
    1,
  );
  const armL = [38, 54, -36, 52];
  const armR = [4 + 10 * strum, 78, 4, 80];
  // Lightning flickers at both sides, and notes burst up from the guitar.
  const flicker = Math.sin(k * 40) > -0.2 && on > 0.5;
  const bolt = (x, s) =>
    `<path transform="translate(${x} 20) scale(${s} 1)" d="M12 0L-8 46L6 46L-6 96L26 36L10 36L22 0Z" fill="#ffe66d" ${stroke(2.6)}/>`;
  let notes = "";
  for (let i = 0; i < 5; i++) {
    const t = (k * 0.9 + i / 5) % 1;
    const side = i % 2 ? 1 : -1;
    notes += note(
      112 + side * (14 + 52 * t) + wave(t, 2, 6),
      140 - 150 * t,
      0.6 + 0.6 * t,
      ["#4a5de0", "#d93d4e", "#2fa86a"][i % 3],
      side * 20 * t,
    );
  }
  const bounds = on > 0.02 ? [box(-10, -20, 210, 196)] : [];
  return {
    roll: 10 * bang,
    y: -4 * Math.abs(bang) * on,
    L: armL,
    R: armR,
    legL: [0, 16 * on],
    legR: [0, 16 * on],
    eyes: "closed",
    mouth: "open",
    mp: 0.8,
    back: flicker ? prop(bolt(-12, 1) + bolt(206, -1)) : "",
    attach: prop(scaled(guitar, 110, 150, Math.max(on, 0.01))),
    front: prop(on > 0.4 ? notes : ""),
    bounds,
  };
}

// ---------------------------------------------------------------- max
// A rocket launch: a pack lights, the whole figure shakes, flame, shock rings
// spread on the ground, Blink lifts off, fireworks burst in four places and a star
// ring orbits.
function max(k) {
  const pack = phase(k, 0, 0.3) * (1 - phase(k, 3.45, 4));
  const ignite = phase(k, 0.3, 0.9);
  const rise = phase(k, 0.9, 2.2) * (1 - phase(k, 2.8, 3.4));
  const lift = -78 * rise;
  const shake = k < 2.2 ? wave(k, 26, (1 + 3 * ignite) * pack) : 0;
  const flame = (cx, len) =>
    `<path d="M${cx - 11} 184Q${cx - 14} ${f1(184 + len * 0.6)} ${cx} ${f1(184 + len)}Q${cx + 14} ${f1(184 + len * 0.6)} ${cx + 11} 184Z" fill="#ff8a2e" ${stroke(2.6)}/><path d="M${cx - 6} 186Q${cx - 7} ${f1(186 + len * 0.5)} ${cx} ${f1(186 + len * 0.72)}Q${cx + 7} ${f1(186 + len * 0.5)} ${cx + 6} 186Z" fill="#ffe66d"/>`;
  const len = (10 + 52 * ignite + 18 * rise) * (0.85 + 0.15 * Math.sin(k * 60));
  const tank = (x) =>
    `<rect x="${x}" y="64" width="22" height="108" rx="9" fill="#cfd5da" ${stroke()}/><path d="M${x} 64Q${x + 11} 38 ${x + 22} 64Z" fill="#d93d4e" ${stroke()}/><rect x="${x + 4}" y="176" width="14" height="10" rx="2" fill="#444c59" ${stroke(2.2)}/>`;
  const packSvg = `${tank(22)}${tank(156)}<rect x="40" y="88" width="120" height="10" fill="none"/>`;
  const behind = scaled(
    prop((ignite > 0.02 ? flame(33, len) + flame(167, len) : "") + packSvg),
    100,
    120,
    Math.max(pack, 0.01),
  );
  // Shock rings spread on the ground as it lifts.
  let rings = "";
  const ring = seg(k, 0.85, 1.8);
  if (ring > 0 && ring < 1)
    for (let i = 0; i < 3; i++) {
      const t = clamp01(ring * 1.2 - i * 0.18);
      if (t <= 0 || t >= 1) continue;
      rings += `<ellipse cx="100" cy="192" rx="${f1(30 + 120 * ease(t))}" ry="${f1(5 + 12 * ease(t))}" fill="none" stroke="#fff" stroke-width="4" opacity="${f1(1 - t)}"/><ellipse cx="100" cy="192" rx="${f1(30 + 120 * ease(t))}" ry="${f1(5 + 12 * ease(t))}" fill="none" ${stroke(1.6)} opacity="${f1((1 - t) * 0.6)}"/>`;
    }
  // Fireworks in four places, one after the other.
  const spots = [
    [-30, 20, 2.0],
    [230, 10, 2.25],
    [20, -50, 2.5],
    [182, -56, 2.75],
  ];
  let fireworks = "";
  const bounds = [];
  for (const [x, y, at] of spots) {
    const u = seg(k, at, at + 0.9);
    if (u > 0 && u < 1) {
      fireworks +=
        burst(x, y, u, 12, 46) +
        burst(x, y, seg(k, at + 0.12, at + 0.9), 8, 26, ["#fff", "#ffd25e"]);
      bounds.push(around(x, y + 8, 56));
    }
  }
  const orbit = seg(k, 2.4, 3.6);
  let ringStars = "";
  if (orbit > 0 && orbit < 1) {
    ringStars = starRing(100, 100 + lift, 96, 74, k, 8, 6);
    bounds.push(box(-8, 14 + lift, 208, 190 + lift));
  }
  if (pack > 0.02) {
    bounds.push(box(14, 30 + lift, 186, 196 + len + lift));
  }
  if (ring > 0 && ring < 1) bounds.push(box(-30, 160, 230, 208));
  const arms = [118, 10, 150, 10];
  return {
    x: shake,
    y: lift,
    L: ignite > 0.1 ? arms : REST,
    R: ignite > 0.1 ? arms : REST,
    legL: [12 * rise, 22 * rise],
    legR: [12 * rise, 22 * rise],
    eyes: "happy",
    mouth: "open",
    mp: 0.9,
    behind,
    mid: prop(rings),
    front: prop(fireworks + ringStars),
    bounds,
  };
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const SHOWS = { low, medium, high, xhigh, max };

/** One still pose for each show, for reduced motion: it says the same thing without
 * moving. */
export const STILL = {
  low: { L: REST, R: [-30, 70, -70, 60], eyes: "closed", blush: 1.2 },
  medium: {
    L: [76, 30, 100, 20],
    R: [76, 30, 100, 20],
    eyes: "open",
    mouth: "open",
    mp: 0.3,
  },
  high: {
    L: [150, 0, 150, 0],
    R: [150, 0, 150, 0],
    legL: [0, 24],
    legR: [0, 24],
    eyes: "closed",
    mouth: "open",
    mp: 0.6,
  },
  xhigh: {
    L: [38, 54, -36, 52],
    R: [4, 78, 4, 80],
    legL: [0, 16],
    legR: [0, 16],
    eyes: "closed",
    mouth: "open",
    mp: 0.8,
    roll: 6,
  },
  max: {
    L: [118, 10, 150, 10],
    R: [118, 10, 150, 10],
    eyes: "happy",
    mouth: "open",
    mp: 0.9,
  },
};

/** The show for an effort, `k` seconds in; null for a name that is not one of ours. */
export function show(effort, k) {
  const make = SHOWS[effort];
  if (!make || k < 0 || k > SHOW_FOR[effort]) return null;
  return make(k);
}
