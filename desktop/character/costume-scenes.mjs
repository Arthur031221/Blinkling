// The four model scenes. Each is a pose plus drawings, a function of `k`, the
// seconds since the scene began, and `power`, 0 to 1 from the effort that is set:
// the flourish at the end is bigger the higher the effort. A scene ends with
// Blink in the model's signature piece (costume-pieces.mjs) and nothing else.
// `bounds` lists the boxes the props fill in the drawing at that moment, so the
// window shape (Windows) keeps them.
import { C, armGeom, clamp, ease, f1, lerp, seg } from "./rig.mjs";
import {
  around,
  box,
  burst,
  glow,
  jitter,
  moved,
  phase,
  prop,
  pulse,
  scaled,
  star,
  stroke,
  streak,
} from "./costume-art.mjs";
import { crown, glasses, hat, plane, scarf } from "./costume-pieces.mjs";

export const SCENE_FOR = 2.8;
const REST = [55, 0, 8, 0];
const wave = (t, f, a = 1) => Math.sin(t * f * Math.PI * 2) * a;
const hand = (side, arm) => {
  const t = armGeom(side, arm, 0).tip;
  return { x: t.x, y: t.y };
};

// ---------------------------------------------------------------- Opus
// A glass phone booth drops in, the door shuts, a flash and a spin, the booth lifts
// away, and Blink strikes a hero pose in a cape. The crown is what stays.
function opus(k, power) {
  const drop = phase(k, 0, 0.5);
  const lift = phase(k, 1.55, 2.05);
  const oy = -150 * (1 - drop) - 80 * lift;
  const door = phase(k, 0.5, 0.78);
  const spin = phase(k, 0.8, 1.5);
  const flash = pulse(k, 0.95, 1.45);
  const capeS = phase(k, 1.15, 1.4) * (1 - phase(k, 2.5, 2.8));
  const crownS = phase(k, 1.3, 1.5);
  const hero = phase(k, 1.5, 1.9) * (1 - phase(k, 2.55, 2.8));
  const a = 1 - Math.min(1, lift * 3);
  // The doors in front of Blink are gone before the booth rises past its face.
  const af = 1 - Math.min(1, lift * 4);
  const shake = k > 0.8 && k < 1.5 ? wave(k, 14, 2) : 0;
  const glass = "#cfeeff";
  const light = k % 0.4 < 0.2 ? "#ffd25e" : "#ff8aa0";
  const leaf = (x0, x1) =>
    `<rect x="${f1(x0)}" y="14" width="${f1(x1 - x0)}" height="172" fill="${glass}" fill-opacity=".3" stroke="${C.ink}" stroke-width="2.4"/>` +
    `<path d="M${f1(x0 + 8)} 150L${f1(x0 + 24)} 40M${f1(x0 + 20)} 160L${f1(x0 + 36)} 70" stroke="#fff" stroke-opacity=".7" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const dw = 68 * door;
  const booth = (front) =>
    front
      ? `<g transform="translate(${f1(shake)} ${f1(oy)})" opacity="${f1(af * 100) / 100}">${leaf(32, 32 + dw)}${leaf(168 - dw, 168)}` +
        `<rect x="24" y="-4" width="152" height="18" rx="5" fill="#c9374d" ${stroke()}/><circle cx="100" cy="-10" r="5" fill="${light}" ${stroke(2.4)}/>` +
        `</g>`
      : `<g transform="translate(${f1(shake)} ${f1(oy)})" opacity="${f1(a * 100) / 100}"><rect x="32" y="14" width="136" height="172" fill="${glass}" fill-opacity=".22"/><rect x="24" y="184" width="152" height="9" rx="3" fill="#43506b" ${stroke()}/></g>`;
  const capeWave = wave(k, 3, 7) * capeS;
  const cape = capeS
    ? scaled(
        `<path d="M56 98Q30 140 ${f1(12 + capeWave)} 182L${f1(188 + capeWave)} 182Q170 140 144 98Z" fill="#c9374d" ${stroke()}/><path d="M58 100Q100 114 142 100" fill="none" ${stroke()}/>`,
        100,
        100,
        capeS,
      )
    : "";
  const sparks =
    k > 1.9
      ? burst(
          100,
          6,
          seg(k, 1.9, 2.7),
          4 + Math.round(power * 8),
          36 + power * 56,
        )
      : "";
  const bounds = [box(24, -16 + oy, 176, 196 + oy)];
  if (flash > 0.02) bounds.push(around(100, 105, 95));
  if (capeS) bounds.push(box(4, 96, 196, 186));
  if (sparks) bounds.push(around(100, 6, 36 + power * 56 + 8));
  return {
    y: -3 * hero,
    yaw: spin < 1 ? 360 * spin : 0,
    roll: 0,
    L: hero > 0.3 ? [100, 0, 60, 0] : REST,
    R: hero > 0.3 ? [100, 0, 60, 0] : REST,
    legL: [0, 14 * hero],
    legR: [0, 14 * hero],
    eyes: k < 0.5 ? "open" : "happy",
    look: k < 0.5 ? [0, -0.8] : null,
    mouth: k < 0.5 ? "o" : "smile",
    mp: 0.6,
    back:
      a > 0.01
        ? prop(booth(false)) + prop(glow(100, 105, 95, flash * 0.9))
        : "",
    front: prop((a > 0.01 ? booth(true) : "") + sparks),
    mid: "",
    behind: prop(cape),
    attach: crownS > 0.01 ? crown(crownS) : "",
    bounds,
  };
}

// ---------------------------------------------------------------- Sonnet
// A wooden chest slides in, Blink digs in it, glasses fly up and land on its face.
function sonnet(k, power) {
  const slide = phase(k, 0, 0.45) * (1 - phase(k, 2.45, 2.8));
  const ox = (1 - slide) * 150;
  const here = ox < 149;
  const open = phase(k, 0.45, 0.8) * (1 - phase(k, 2.1, 2.4));
  const dig = seg(k, 0.6, 1.5);
  const bob = dig > 0 && dig < 1 ? Math.sin(dig * Math.PI * 4) : 0;
  const fly = seg(k, 1.4, 2.0);
  const landed = k >= 2.0;
  const wood = "#b97a43";
  const chest = (lid) => {
    const base =
      `<rect x="26" y="140" width="148" height="50" rx="6" fill="${wood}" ${stroke()}/>` +
      `<path d="M26 156H174M62 140V190M138 140V190" fill="none" stroke="#7a4d28" stroke-width="3"/>` +
      `<rect x="92" y="150" width="16" height="14" rx="3" fill="#ffd25e" ${stroke(2.4)}/>`;
    const inside =
      open > 0.05
        ? `<rect x="32" y="142" width="136" height="${f1(12 * open)}" rx="3" fill="#3a2a1c"/>`
        : "";
    const top = 140 - 16 - 36 * open;
    const lidSvg = `<path d="M${f1(26)} 140L${f1(26 + 10 * open)} ${f1(top)}L${f1(174 - 10 * open)} ${f1(top)}L174 140Z" fill="#c98b52" ${stroke()}/>`;
    return lid ? lidSvg : base + inside;
  };
  // The glasses fly from the chest up over the head and come down on the face.
  let flying = "";
  let fly3 = null;
  if (fly > 0 && !landed) {
    const e = ease(fly);
    const x = lerp(100, 100, e) + Math.sin(fly * Math.PI) * 52;
    const y = lerp(150, 92, e) - Math.sin(fly * Math.PI) * 130;
    const rot = fly * 360;
    flying = prop(
      moved(
        `<g transform="translate(-100 -92)">${glasses(1)}</g>`,
        x,
        y,
        rot,
        lerp(0.55, 1, e),
      ),
    );
    fly3 = { x, y, s: 40 };
  }
  const landS = phase(k, 2.0, 2.15);
  const glint =
    landed && k < 2.6
      ? star(76 - 10, 80, 6 + 8 * power, "#fff", k * 300) +
        burst(
          100,
          92,
          seg(k, 2.0, 2.6),
          3 + Math.round(power * 7),
          30 + power * 50,
        )
      : "";
  const hold = hand(1, [120, 50, 70, 30]);
  const bounds = [box(20 + ox, 100, 180 + ox, 192)];
  if (fly3) bounds.push(around(fly3.x, fly3.y, 36));
  if (glint) bounds.push(around(100, 92, 50 + power * 50));
  void hold;
  const adjust = phase(k, 2.1, 2.3) * (1 - phase(k, 2.5, 2.7));
  return {
    y: 5 * open * (1 - phase(k, 1.6, 2.0)),
    roll: 7 * open * (1 - phase(k, 1.6, 2.0)),
    L: dig > 0 && dig < 1 ? [20 + 10 * bob, 60, -20, 50] : REST,
    R:
      adjust > 0.05
        ? [150, 30, 110, 40]
        : dig > 0 && dig < 1
          ? [20 - 10 * bob, 60, -20, 50]
          : REST,
    eyes: dig > 0 && dig < 1 ? "open" : "happy",
    look: dig > 0 && dig < 1 ? [0, 0.8] : fly > 0 && !landed ? [0, -0.7] : null,
    mouth: landed ? "open" : "smile",
    mp: 0.5,
    back: here
      ? prop(`<g transform="translate(${f1(ox)} 0)">${chest(true)}</g>`)
      : "",
    front:
      (here
        ? prop(`<g transform="translate(${f1(ox)} 0)">${chest(false)}</g>`)
        : "") +
      flying +
      prop(glint),
    behind: "",
    faceExtra: landed ? glasses(landS) : "",
    attach: "",
    bounds,
  };
}

// ---------------------------------------------------------------- Haiku
// A gust of wind, a scarf flies in and winds round the belly, a paper plane loops
// once round Blink. The scarf and the plane stay.
function haiku(k, power) {
  const gust = pulse(k, 0, 1.3);
  const wind = (n) => {
    let out = "";
    for (let i = 0; i < n; i++) {
      const t = (k * 1.6 + i * 0.37) % 1;
      const y = 40 + i * 28 + jitter(i) * 14;
      const x = -50 + t * 280;
      out += streak(
        x,
        y,
        46 + jitter(i, 3) * 30,
        i % 2 ? "#bfe3ff" : "#e9f6ff",
        3,
      );
    }
    return out;
  };
  const come = phase(k, 0.45, 1.2);
  const wind2 = seg(k, 1.2, 1.55);
  const snap = pulse(k, 1.5, 1.7);
  // The scarf comes in as a long ribbon that shortens as it winds on.
  let ribbon = "";
  if (k > 0.4 && k < 1.25) {
    const tail = (1 - come) * 190;
    const cy = 150 - 30 * Math.sin(come * Math.PI);
    ribbon = `<path d="M${f1(-40 - tail)} ${f1(cy - 24)}Q${f1(-10 - tail * 0.5)} ${f1(cy - 50)} ${f1(30 - tail * 0.2)} ${f1(cy)}T${f1(42)} 148" fill="none" stroke="#ee6a56" stroke-width="12" stroke-linecap="round"/><path d="M${f1(-40 - tail)} ${f1(cy - 24)}Q${f1(-10 - tail * 0.5)} ${f1(cy - 50)} ${f1(30 - tail * 0.2)} ${f1(cy)}T${f1(42)} 148" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round" stroke-opacity=".5" transform="translate(0 7)"/>`;
  }
  const turns = k < 1.2 ? 0 : clamp(wind2 * 1.2);
  const loop = seg(k, 1.5, 2.55);
  let planeSvg = "";
  let planeAt = null;
  if (loop > 0 && loop < 1) {
    const a = loop * Math.PI * 2 - Math.PI * 0.2;
    const rx = lerp(64, 78, loop),
      ry = 58;
    const x = 100 + Math.cos(a) * rx,
      y = 90 + Math.sin(a) * ry;
    const heading =
      (Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx) * 180) / Math.PI;
    planeAt = { x, y };
    let trail = "";
    for (let i = 1; i <= 9; i++) {
      const b = a - i * 0.16;
      trail += `<circle cx="${f1(100 + Math.cos(b) * rx)}" cy="${f1(90 + Math.sin(b) * ry)}" r="${f1(3.2 - i * 0.28)}" fill="#fff" stroke="${C.ink}" stroke-width="1.2" opacity="${f1(1 - i * 0.1)}"/>`;
    }
    planeSvg =
      trail +
      moved(
        `<path d="M-18 6L20 -8L-6 20L-10 10Z" fill="${C.white}" ${stroke(2.6)}/><path d="M-10 10L20 -8" fill="none" stroke="#7a8a84" stroke-width="2"/>`,
        x,
        y,
        heading,
        1,
      );
  }
  const settle = k >= 2.55;
  const bounds = [];
  if (gust > 0.02) bounds.push(box(-50, 30, 250, 190));
  if (ribbon) bounds.push(box(-60, 60, 120, 190));
  if (planeAt) bounds.push(box(10, 20, 190, 160));
  const sparkle =
    k > 2.4
      ? burst(
          170,
          34,
          seg(k, 2.4, 2.8),
          3 + Math.round(power * 7),
          24 + power * 44,
        )
      : "";
  if (sparkle) bounds.push(around(170, 34, 24 + power * 44 + 8));
  return {
    roll: -7 * gust,
    y: 0,
    L: gust > 0.2 ? [40, 30, 30, 20] : REST,
    R: gust > 0.2 ? [40, 30, 30, 20] : REST,
    legL: [0, 8 * gust],
    legR: [0, 8 * gust],
    eyes: gust > 0.3 ? "closed" : "happy",
    mouth: planeAt ? "open" : "smile",
    mp: 0.5,
    back: prop(wind(5).repeat(gust > 0.02 ? 1 : 0)),
    mid: "",
    front: prop(ribbon + planeSvg + sparkle),
    behind: "",
    attach: turns > 0 ? scaled(scarf(0, turns, snap), 100, 148, 1) : "",
    ...(settle ? { attach: scarf(0, 1) + plane(k, 1) } : {}),
    bounds,
  };
}

// ---------------------------------------------------------------- Fable
// A big storybook opens in front of Blink, stars pour out, a pointed hat flies out
// of it and lands on Blink's head. The hat is what stays.
function fable(k, power) {
  const rise = phase(k, 0, 0.45) * (1 - phase(k, 2.35, 2.75));
  const openBook = phase(k, 0.3, 0.8);
  const oy = (1 - rise) * 70;
  const pulseGlow = 0.5 + 0.5 * Math.sin(k * 9);
  const cover = "#6a4fb0";
  const spread = 56 * openBook;
  const book =
    `<g transform="translate(0 ${f1(oy)})">` +
    glow(
      100,
      150,
      40 + 30 * openBook,
      0.25 * openBook * (0.6 + 0.4 * pulseGlow),
      "#ffe08a",
    ) +
    `<path d="M${f1(100 - spread - 6)} 148L100 160L${f1(100 + spread + 6)} 148L${f1(100 + spread + 6)} 186L100 194L${f1(100 - spread - 6)} 186Z" fill="${cover}" ${stroke()}/>` +
    `<path d="M${f1(100 - spread)} 146Q${f1(100 - spread / 2)} 140 100 152L100 188Q${f1(100 - spread / 2)} 182 ${f1(100 - spread)} 188Z" fill="#fff6dc" ${stroke(2.6)}/>` +
    `<path d="M${f1(100 + spread)} 146Q${f1(100 + spread / 2)} 140 100 152L100 188Q${f1(100 + spread / 2)} 182 ${f1(100 + spread)} 188Z" fill="#fff6dc" ${stroke(2.6)}/>` +
    (openBook > 0.6
      ? `<path d="M${f1(100 - spread + 8)} 158Q${f1(100 - spread / 2)} 154 92 164M${f1(100 - spread + 8)} 168Q${f1(100 - spread / 2)} 164 92 174M${f1(100 + spread - 8)} 158Q${f1(100 + spread / 2)} 154 108 164M${f1(100 + spread - 8)} 168Q${f1(100 + spread / 2)} 164 108 174" fill="none" stroke="#b0a58a" stroke-width="2.2" stroke-linecap="round"/>`
      : "") +
    `</g>`;
  // Stars pour up out of the book in a fountain.
  let stars = "";
  const pour = seg(k, 0.7, 2.3);
  if (pour > 0 && pour < 1) {
    const n = 7 + Math.round(power * 8);
    for (let i = 0; i < n; i++) {
      const t = (pour * 1.6 + i / n) % 1;
      const side = i % 2 ? 1 : -1;
      const x = 100 + side * (20 + 60 * t * (0.4 + jitter(i)));
      const y =
        150 - 150 * Math.sin(t * Math.PI * 0.9) * (0.5 + 0.5 * jitter(i, 4));
      stars += star(
        x,
        y,
        3.4 + 4 * jitter(i, 5),
        i % 2 ? "#ffd25e" : "#8ff0c2",
        t * 400,
      );
    }
  }
  // The hat flies out beside the head, up and over, and comes down on it.
  const flight = seg(k, 1.4, 2.2);
  const landS = k >= 2.2 ? phase(k, 2.2, 2.35) : 0;
  let hatSvg = "";
  let hatAt = null;
  if (flight > 0 && flight < 1) {
    const e = ease(flight);
    const pts = [
      [128, 150],
      [196, 100],
      [176, 8],
      [100, -26],
    ];
    const seg3 = e * 3;
    const i = Math.min(2, Math.floor(seg3)),
      f = seg3 - i;
    const x = lerp(pts[i][0], pts[i + 1][0], f);
    const y = lerp(pts[i][1], pts[i + 1][1], f);
    const rot = lerp(60, 0, e) + Math.sin(flight * Math.PI * 3) * 14;
    hatAt = { x, y };
    hatSvg = prop(
      moved(
        `<g transform="translate(-100 -40)">${hat(1)}</g>`,
        x,
        y + 40 * (1 - e) * 0,
        rot,
        lerp(0.45, 1, e),
      ),
    );
  }
  const closeBook = k > 2.35 ? 1 : 0;
  const bounds = [];
  if (rise > 0.01) bounds.push(box(26, 130 + oy, 174, 196 + oy));
  if (rise > 0.01 && openBook > 0.3) bounds.push(box(20, 40, 180, 196));
  if (hatAt) bounds.push(around(hatAt.x, hatAt.y + 20, 70));
  const fin =
    k > 2.2
      ? burst(
          100,
          10,
          seg(k, 2.2, 2.8),
          4 + Math.round(power * 8),
          36 + power * 56,
        )
      : "";
  if (fin) bounds.push(around(100, 10, 36 + power * 56 + 8));
  void closeBook;
  return {
    y: 0,
    L: openBook > 0.3 && rise > 0.3 ? [38, 55, -30, 40] : REST,
    R: openBook > 0.3 && rise > 0.3 ? [38, 55, -30, 40] : REST,
    eyes: k < 0.3 ? "open" : "happy",
    look:
      flight > 0 && flight < 1
        ? [0.6, -0.7]
        : openBook > 0.3 && k < 1.4
          ? [0, 0.6]
          : null,
    mouth: "open",
    mp: 0.4,
    back: "",
    mid: "",
    front: prop((rise > 0.01 ? book : "") + stars + fin) + hatSvg,
    behind: "",
    attach: landS > 0 ? hat(landS) : "",
    bounds,
  };
}

const SCENES = { opus, sonnet, haiku, fable };

/** The scene for a family, `k` seconds in; null for a family that has none. */
export function scene(family, k, power = 0.5) {
  const make = SCENES[family];
  if (!make || k < 0 || k > SCENE_FOR) return null;
  const out = make(k, clamp(power));
  // A layer whose props are all gone is empty, not a group with nothing in it.
  for (const layer of ["back", "behind", "mid", "front"])
    if (out[layer] && !/<(path|circle|rect|ellipse|polygon)\b/.test(out[layer]))
      out[layer] = "";
  return out;
}
