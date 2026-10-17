// The small drawing kit the model scenes and the effort shows share. Everything is
// plain SVG in Blink's drawing space (200 wide, the ground at y 190), thin ink
// outlines like the rig, and every prop sits in a `prop` group so a test can find it.
import { C, clamp, ease, f1, seg } from "./rig.mjs";

export const INK = C.ink;
export const stroke = (w = 3) =>
  `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
export const prop = (svg) => `<g class="prop">${svg}</g>`;
/** `svg` scaled about (cx, cy); a whole scale draws it as it is. */
export const scaled = (svg, cx, cy, s) =>
  s >= 0.999
    ? svg
    : `<g transform="translate(${f1(cx)} ${f1(cy)}) scale(${f1(Math.max(s, 0.001))}) translate(${f1(-cx)} ${f1(-cy)})">${svg}</g>`;
export const moved = (svg, x, y, rotate = 0, s = 1) =>
  `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rotate)}) scale(${f1(s)})">${svg}</g>`;
export const faded = (svg, a) =>
  a >= 0.999 ? svg : `<g opacity="${f1(clamp(a) * 100) / 100}">${svg}</g>`;
export const circle = (x, y, r, fill, w = 2.4) =>
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}" ${stroke(w)}/>`;
export const rect = (x, y, w, h, r, fill, sw = 3) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${r}" fill="${fill}" ${stroke(sw)}/>`;
export const path = (d, fill = "none", w = 3) =>
  `<path d="${d}" fill="${fill}" ${stroke(w)}/>`;
export const line = (x1, y1, x2, y2, color, w = 2.4) =>
  `<path d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
/** An axis aligned box [x1, y1, x2, y2] in the drawing. */
export const box = (x1, y1, x2, y2) => [x1, y1, x2, y2].map(f1);
export const around = (x, y, r) => box(x - r, y - r, x + r, y + r);

/** A four pointed star, a little brighter than the rig's own. */
export function star(x, y, r, fill = "#ffd25e", rot = 0) {
  const k = r * 0.3;
  return `<path transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})" d="M0 ${f1(-r)}Q${f1(k)} ${f1(-k)} ${f1(r)} 0Q${f1(k)} ${f1(k)} 0 ${f1(r)}Q${f1(-k)} ${f1(k)} ${f1(-r)} 0Q${f1(-k)} ${f1(-k)} 0 ${f1(-r)}Z" fill="${fill}" ${stroke(2)}/>`;
}
/** A music note: a head, a stem and a flag. */
export function note(x, y, s, fill = "#4a5de0", rot = 0) {
  return moved(
    `<ellipse cx="0" cy="0" rx="6" ry="4.4" transform="rotate(-20)" fill="${fill}" ${stroke(2)}/><path d="M5 -2L5 -22Q12 -18 14 -12" fill="none" ${stroke(2.4)}/>`,
    x,
    y,
    rot,
    s,
  );
}
/** A short curved streak, for wind and speed. */
export const streak = (x, y, len, color = "#bfe3ff", w = 3) =>
  `<path d="M${f1(x)} ${f1(y)}q${f1(len * 0.4)} -7 ${f1(len * 0.7)} 0t${f1(len * 0.3)} -2" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
/** Steady pseudo random numbers, so a burst looks the same in every frame. */
export const jitter = (i, salt = 0) => {
  const v = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const BURST = ["#ffd25e", "#8ff0c2", "#ff8aa0"];
/** A burst of `n` stars flying out from (x, y) as `u` goes 0 to 1. */
export function burst(x, y, u, n, reach, fill = BURST) {
  if (u <= 0 || u >= 1) return "";
  const e = ease(u);
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + jitter(i) * 0.5;
    const r = reach * e * (0.7 + 0.3 * jitter(i, 1));
    out += star(
      x + Math.cos(a) * r,
      y + Math.sin(a) * r + 14 * u * u,
      (4.5 + 4.5 * jitter(i, 2)) * (1 - u * 0.6),
      fill[i % fill.length],
      u * 160,
    );
  }
  return out;
}
/** A ring of stars turning round (cx, cy). */
export function starRing(cx, cy, rx, ry, k, n, size = 5) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k * 3.2;
    out += star(
      cx + Math.cos(a) * rx,
      cy + Math.sin(a) * ry,
      size * (0.8 + 0.4 * Math.sin(a * 2 + k * 5)),
      i % 2 ? "#8ff0c2" : "#ffd25e",
      k * 120 + i * 30,
    );
  }
  return out;
}
/** A soft round flash, kept inside the drawing around Blink. */
export const glow = (cx, cy, r, a, color = "#fff") =>
  a <= 0.01
    ? ""
    : `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${color}" opacity="${f1(clamp(a) * 100) / 100}"/>`;
/** 0 to 1 over [a, b] seconds, eased. */
export const phase = (k, a, b) => ease(seg(k, a, b));
/** Up and down again over [a, b]. */
export const pulse = (k, a, b) => Math.sin(seg(k, a, b) * Math.PI);
