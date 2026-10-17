// What Blink wears and does when the model or the effort changes. The change itself
// is decided here (costumeChange); the drawing is plain rig fields: `behind` goes
// under the body, `attach` and `faceExtra` move with it. Nothing here runs at
// startup or when a pick lands on the value already in use.
import { C, clamp, ease, f1, lerp, seg } from "./rig.mjs";
import { star4 } from "./motions.mjs";

export const FAMILIES = ["opus", "sonnet", "haiku", "fable"];
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
/** How long the outfit stays on, in seconds: the move comes first, then Blink
 * stands in the outfit until it is taken off again. */
export const COSTUME_FOR = 5;
const MOVE_FOR = { low: 1.4, medium: 1.5, high: 2.4, xhigh: 2.8, max: 3.4 };
export const moveFor = (effort) => MOVE_FOR[effort] ?? MOVE_FOR.medium;
const POP = 0.35;

/** What to play when the pick goes from `before` to `after`, or null: no play for the
 * first pick, for the same value, or for a name that is not one of ours. */
export function costumeChange(before, after) {
  if (!before || !after) return null;
  if (!FAMILIES.includes(after.family) || !EFFORTS.includes(after.effort))
    return null;
  if (before.family !== after.family)
    return { family: after.family, effort: after.effort, what: "model" };
  if (before.effort !== after.effort)
    return { family: after.family, effort: after.effort, what: "effort" };
  return null;
}

const pop = (svg, cx, cy, s) =>
  s >= 0.999
    ? svg
    : `<g transform="translate(${cx} ${cy}) scale(${f1(s)}) translate(${-cx} ${-cy})">${svg}</g>`;
const stroke = `stroke="${C.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const OUTFITS = {
  // A crown and a cape that flares out behind.
  opus: (s) => ({
    behind: pop(
      `<path d="M56 98Q30 140 12 180L188 180Q170 140 144 98Z" fill="#c9374d" ${stroke}/><path d="M58 100Q100 114 142 100" fill="none" ${stroke}/>`,
      100,
      100,
      s,
    ),
    attach: pop(
      `<path d="M68 40L64 8L84 24L100 2L116 24L136 8L132 40Z" fill="#ffd25e" ${stroke}/><circle cx="100" cy="30" r="4" fill="#c9374d" stroke="${C.ink}" stroke-width="2"/>`,
      100,
      40,
      s,
    ),
  }),
  // Round glasses and a notebook held against the belly.
  sonnet: (s) => ({
    faceExtra: pop(
      `<circle cx="76" cy="92" r="23" fill="#fff" fill-opacity=".18" ${stroke}/><circle cx="124" cy="92" r="23" fill="#fff" fill-opacity=".18" ${stroke}/><path d="M99 92L101 92" ${stroke}/>`,
      100,
      92,
      s,
    ),
    attach: pop(
      `<g transform="rotate(-8 128 146)"><rect x="104" y="124" width="46" height="38" rx="4" fill="${C.white}" ${stroke}/><path d="M112 134H142M112 142H142M112 150H134" fill="none" stroke="#7a8a84" stroke-width="2.4" stroke-linecap="round"/><path d="M104 124V162" fill="none" ${stroke}/></g>`,
      128,
      146,
      s,
    ),
  }),
  // A scarf round the middle and a paper plane circling beside the head.
  haiku: (s) => ({
    attach:
      pop(
        `<path d="M44 112Q100 128 156 112L156 126Q100 142 44 126Z" fill="#ee6a56" ${stroke}/><path d="M134 128L146 160L158 154L150 124Z" fill="#ee6a56" ${stroke}/>`,
        100,
        124,
        s,
      ) +
      pop(
        `<path d="M150 34L192 22L166 52L162 42Z" fill="${C.white}" ${stroke}/><path d="M162 42L192 22" fill="none" stroke="#7a8a84" stroke-width="2"/>`,
        172,
        36,
        s,
      ),
  }),
  // A storyteller's pointed hat with stars.
  fable: (s) => ({
    attach: pop(
      `<ellipse cx="100" cy="40" rx="48" ry="9" fill="#6a4fb0" ${stroke}/><path d="M66 38Q76 6 120 -16Q112 14 134 38Z" fill="#7c5fc4" ${stroke}/>${star4(98, 18, 6, "#ffd25e", 0)}${star4(116, 4, 4, "#ffd25e", 20)}`,
      100,
      40,
      s,
    ),
  }),
};

/** The outfit as rig fields, at `k` seconds into the costume; null outside it. */
export function costumeOutfit(family, k) {
  const make = OUTFITS[family];
  if (!make || k < 0 || k > COSTUME_FOR) return null;
  const s =
    ease(seg(k, 0, POP)) * (1 - ease(seg(k, COSTUME_FOR - POP, COSTUME_FOR)));
  const o = make(Math.max(s, 0.02));
  return { behind: "", attach: "", faceExtra: "", front: "", ...o };
}

const REST = [55, 0, 8, 0];
const sparkles = (k, n, fade = 1) => {
  let out = "";
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2 + k * 3,
      r = 78 + 14 * Math.sin(k * 7 + j);
    out += star4(
      100 + Math.cos(a) * r,
      104 + Math.sin(a) * r * 0.85,
      (4 + (j % 3) * 2) * fade,
      j % 2 ? "#8ff0c2" : "#ffd25e",
      k * 200 + j * 40,
    );
  }
  return out;
};

/** The move for an effort, `k` seconds in. `reduced` is one still pose that says the
 * same thing without moving. */
export function costumeMove(effort, k, reduced) {
  if (reduced) return STILL[effort] ?? STILL.medium;
  const u = clamp(k / moveFor(effort));
  const env = Math.sin(u * Math.PI);
  switch (effort) {
    case "low": {
      // Two small nods with the eyes shut at the bottom of each.
      const n = Math.sin(u * Math.PI * 4);
      return {
        y: 5 * Math.max(0, n),
        eyes: n > 0.5 ? "closed" : "open",
        L: REST,
        R: REST,
      };
    }
    case "medium": {
      const hop = Math.sin(clamp(u * 1.15) * Math.PI);
      const air = hop > 0.15;
      return {
        y: -24 * hop,
        L: [95, 10, 125, 10],
        R: [95, 10, 125, 10],
        legL: air ? [12, 20] : [0, 0],
        legR: air ? [12, 20] : [0, 0],
        eyes: "happy",
        mouth: "open",
        mp: 0.7,
      };
    }
    case "high": {
      // Feet apart, fists up, chest out, held.
      const hold = ease(seg(u, 0, 0.25)) * (1 - ease(seg(u, 0.85, 1)));
      return {
        L: [lerp(55, 140, hold), 12, lerp(8, 70, hold), 0],
        R: [lerp(55, 140, hold), 12, lerp(8, 70, hold), 0],
        legL: [0, 26 * hold],
        legR: [0, 26 * hold],
        y: -2 * hold,
        eyes: "happy",
        mouth: "open",
        mp: 0.6 * hold,
        front: sparkles(u, 3, hold),
      };
    }
    default: {
      // xhigh and max: spins round, arms out, sparkles. Max spins one more time.
      const turns = effort === "max" ? 3 : 2;
      const swing = Math.sin(u * Math.PI * 2 * turns);
      return {
        yaw: 72 * swing,
        y: -30 * env,
        roll: 6 * swing,
        L: [118, 10, 150, 10],
        R: [118, 10, 150, 10],
        legL: [12, 22],
        legR: [12, 22],
        eyes: "happy",
        mouth: "open",
        mp: 0.8,
        front: sparkles(k, effort === "max" ? 9 : 6, env),
      };
    }
  }
}

const STILL = {
  low: { L: REST, R: REST, eyes: "closed" },
  medium: { L: [95, 10, 125, 10], R: [95, 10, 125, 10], eyes: "happy" },
  high: {
    L: [140, 12, 70, 0],
    R: [140, 12, 70, 0],
    legL: [0, 26],
    legR: [0, 26],
    eyes: "happy",
  },
  xhigh: {
    L: [118, 10, 150, 10],
    R: [118, 10, 150, 10],
    eyes: "happy",
    front: sparkles(0.2, 6),
  },
  max: {
    L: [118, 10, 150, 10],
    R: [118, 10, 150, 10],
    eyes: "happy",
    mouth: "open",
    mp: 0.8,
    front: sparkles(0.2, 9),
  },
};
