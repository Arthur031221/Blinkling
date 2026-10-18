// The one piece each model leaves on Blink once its scene is over. A piece is drawn
// into the rig's own fields (`attach` moves with the body, `faceExtra` with the
// face) and never covers an eye or the mouth: the crown sits on the head, the
// glasses are two clear rings, the scarf is a band round the belly below the mouth
// that follows the body's outline as Blink turns, the hat sits on the head.
import { C, f1, silhouette } from "./rig.mjs";
import { moved, prop, scaled, stroke, star } from "./costume-art.mjs";

/** The piece turned over about the vertical line through `cx`, `m` of the way (0
 * as drawn, 1 mirrored). The right edge turns the figure the other way round, so
 * what is drawn on one side of the body (the hat's tip, the knot, the plane) goes
 * to the other side there, and the picture at the right edge is the left edge's
 * mirror image. In between it turns over like a card, so nothing pops. */
export const flipX = (svg, m = 0, cx = 100) =>
  m > 0.001
    ? `<g transform="translate(${cx} 0) scale(${f1(Math.cos(Math.PI * Math.min(1, m)))} 1) translate(${-cx} 0)">${svg}</g>`
    : svg;

export const CROWN = "M68 40L64 8L84 24L100 2L116 24L136 8L132 40Z";
export const HAT_BRIM = { cx: 100, cy: 40, rx: 48, ry: 9 };

export const crown = (s = 1) =>
  scaled(
    prop(
      `<path d="${CROWN}" fill="#ffd25e" ${stroke()}/><circle cx="100" cy="30" r="4" fill="#c9374d" stroke="${C.ink}" stroke-width="2"/><circle cx="76" cy="26" r="2.6" fill="#c9374d"/><circle cx="124" cy="26" r="2.6" fill="#c9374d"/>`,
    ),
    100,
    40,
    s,
  );

export const glasses = (s = 1) =>
  scaled(
    prop(
      `<circle cx="76" cy="92" r="23" fill="#fff" fill-opacity=".12" ${stroke()}/><circle cx="124" cy="92" r="23" fill="#fff" fill-opacity=".12" ${stroke()}/><path d="M99 90Q100 87 101 90" fill="none" ${stroke()}/><path d="M53 88L44 84M147 88L156 84" fill="none" ${stroke(2.6)}/>`,
    ),
    100,
    92,
    s,
  );

export const hat = (s = 1, m = 0) =>
  scaled(
    prop(
      flipX(
        `<ellipse cx="100" cy="40" rx="48" ry="9" fill="#6a4fb0" ${stroke()}/><path d="M66 38Q76 6 120 -16Q112 14 134 38Z" fill="#7c5fc4" ${stroke()}/><path d="M68 36Q100 44 132 36" fill="none" stroke="#ffd25e" stroke-width="3.4" stroke-linecap="round"/>${star(98, 18, 6)}${star(116, 4, 4, "#ffd25e", 20)}`,
        m,
      ),
    ),
    100,
    40,
    s,
  );

/** The scarf: a band across y 140 to 156 as wide as the body is at the moment, a
 * knot on the right and a short end hanging inside the outline. `turns` is how
 * much of it is wound on, 0 to 1, and `snap` a quick extra tightening. */
export function scarf(yaw = 0, turns = 1, snap = 0, m = 0) {
  const { x1, x2 } = silhouette(yaw);
  const a = x1 - 3,
    b = x2 + 3,
    mid = (a + b) / 2;
  const top = 140 + snap * 2,
    bottom = 156 - snap * 2;
  const w = (b - a) * Math.min(1, Math.max(0, turns));
  let out = `<path d="M${f1(a)} ${f1(top)}Q${f1(mid)} ${f1(top + 5)} ${f1(a + w)} ${f1(top)}L${f1(a + w)} ${f1(bottom)}Q${f1(mid)} ${f1(bottom + 5)} ${f1(a)} ${f1(bottom)}Z" fill="#ee6a56" ${stroke()}/>`;
  if (turns >= 0.999) {
    // Two folds across the band, and the knot with its short end.
    for (const t of [0.3, 0.62])
      out += `<path d="M${f1(a + (b - a) * t)} ${f1(top + 3)}L${f1(a + (b - a) * t + 5)} ${f1(bottom + 3)}" fill="none" stroke="#c4483a" stroke-width="2.4" stroke-linecap="round"/>`;
    const kx = b - 22;
    out += flipX(
      `<path d="M${f1(kx)} ${f1(bottom - 1)}L${f1(kx + 4)} 172L${f1(kx + 15)} 170L${f1(kx + 12)} ${f1(bottom - 1)}Z" fill="#ee6a56" ${stroke()}/><circle cx="${f1(kx + 7)}" cy="148" r="6" fill="#ee6a56" ${stroke()}/>`,
      m,
      mid,
    );
  }
  return prop(out);
}

/** A paper plane that hovers beside the head, bobbing a little. */
export const plane = (t = 0, s = 1, m = 0) =>
  scaled(
    prop(
      flipX(
        moved(
          `<path d="M-18 6L20 -8L-6 20L-10 10Z" fill="${C.white}" ${stroke(2.6)}/><path d="M-10 10L20 -8" fill="none" stroke="#7a8a84" stroke-width="2"/>`,
          170,
          34 + Math.sin(t * 2.2) * 2.5,
          -8,
          0.8,
        ),
        m,
      ),
    ),
    170,
    34,
    s,
  );

/** The piece for a family as rig fields, `s` of the way popped in. */
export function piece(family, { s = 1, yaw = 0, t = 0, mirror = 0 } = {}) {
  const none = { attach: "", faceExtra: "" };
  if (s <= 0.001) return none;
  switch (family) {
    case "opus":
      return { ...none, attach: crown(s) };
    case "sonnet":
      return { ...none, faceExtra: glasses(s) };
    case "haiku":
      return {
        ...none,
        attach:
          scaled(scarf(yaw, 1, 0, mirror), 100, 148, s) + plane(t, s, mirror),
      };
    case "fable":
      return { ...none, attach: hat(s, mirror) };
    default:
      return none;
  }
}

export const PIECES = ["opus", "sonnet", "haiku", "fable"];

/** Where each kept piece reaches beyond the body, as boxes in the drawing
 * (x1, y1, x2, y2). Where the system clips Blink's window to a shape, these keep
 * the crown's points, the glasses' arms, the hat's tip and the plane inside it. */
const REACH = {
  opus: [[59, -5, 141, 45]],
  sonnet: [[37, 63, 163, 121]],
  haiku: [[143, 13, 199, 61]],
  fable: [[47, -23, 153, 53]],
};
export const pieceBoxes = (family) => REACH[family] ?? [];
