// Blink's rig, ported from the approved drawing without changing a number.
// Every constant below comes from the standing pose and never changes: poses only
// rotate joints (shoulder, elbow, hip) and move or turn the whole body, so arm and
// leg lengths stay fixed and the body is a rigid box that is never stretched.
import { poseTransform } from "./transform.mjs";
export const C = {
  ink: "#121614",
  fill: "#43d896",
  side: "#37c787",
  shade: "#33c283",
  hi: "#8ff0c2",
  white: "#f6f5f0",
  blush: "#e7a3ad",
  mouth: "#3a1e24",
  tongue: "#f27a8f",
  shoe: "#121614",
};
export const BODY = {
  cx: 100,
  top: 34,
  bottom: 176,
  w: 120,
  d: 60,
  rx: 32,
  ryTop: 32,
  ryBot: 30,
  line: 5,
};
export const LIMB_LINE = 4.2;
export const ARM = {
  sx: 58,
  sy: 111,
  up: 13,
  fore: 12,
  r0: 12.5,
  r1: 8.6,
  n: 22,
};
export const LEG = { hx: 17, hy: 166, len: 15, r: 7, shoeW: 23, shoeH: 9 };
export const FACE = {
  eyeX: [76, 124],
  eyeY: 92,
  eyeRx: 16,
  eyeRy: 18,
  pupil: 9,
  blushX: [58, 142],
  blushY: 118,
};
export const PERSP = 700;
export const D2R = Math.PI / 180;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const f1 = (v) => Math.round(v * 10) / 10;

// Direction of a limb segment in body space. abd: degrees away from hanging straight
// down, outward positive (180 = straight up, negative = across the body).
// fwd: degrees toward the viewer. y grows downward as in SVG, z grows toward the viewer.
export function dir(side, abd, fwd) {
  const a = abd * D2R,
    f = fwd * D2R;
  return [
    side * Math.sin(a) * Math.cos(f),
    Math.cos(a) * Math.cos(f),
    Math.sin(f),
  ];
}
const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];

// Turn the body about its vertical axis, then a weak perspective toward the viewer.
export function project(p, yaw) {
  const c = Math.cos(yaw * D2R),
    s = Math.sin(yaw * D2R);
  const x = p[0] - BODY.cx,
    z = p[2];
  const X = BODY.cx + x * c + z * s,
    Z = -x * s + z * c;
  const k = PERSP / (PERSP - Z);
  return { x: BODY.cx + (X - BODY.cx) * k, y: 105 + (p[1] - 105) * k, z: Z, k };
}

export function boxPath(x1, x2, y1, y2) {
  const { rx, ryTop: t, ryBot: b } = BODY;
  const r = Math.min(rx, (x2 - x1) / 2);
  return (
    `M${f1(x1 + r)} ${y1}H${f1(x2 - r)}C${f1(x2 - r * 0.31)} ${y1} ${f1(x2)} ${y1 + t * 0.31} ${f1(x2)} ${y1 + t}` +
    `V${y2 - b}C${f1(x2)} ${y2 - b * 0.33} ${f1(x2 - r * 0.31)} ${y2} ${f1(x2 - r)} ${y2}H${f1(x1 + r)}` +
    `C${f1(x1 + r * 0.31)} ${y2} ${f1(x1)} ${y2 - b * 0.33} ${f1(x1)} ${y2 - b}V${y1 + t}` +
    `C${f1(x1)} ${y1 + t * 0.31} ${f1(x1 + r * 0.31)} ${y1} ${f1(x1 + r)} ${y1}Z`
  );
}

/** The outline of boxPath as points, for the click area: the same corner curves,
 * sampled. */
export function boxPolygon(x1, x2, y1, y2, steps = 6) {
  const { rx, ryTop: t, ryBot: b } = BODY;
  const r = Math.min(rx, (x2 - x1) / 2);
  const curve = (p0, p1, p2, p3) =>
    Array.from({ length: steps }, (_, i) => {
      const u = (i + 1) / steps,
        v = 1 - u;
      return {
        x:
          v * v * v * p0[0] +
          3 * v * v * u * p1[0] +
          3 * v * u * u * p2[0] +
          u * u * u * p3[0],
        y:
          v * v * v * p0[1] +
          3 * v * v * u * p1[1] +
          3 * v * u * u * p2[1] +
          u * u * u * p3[1],
      };
    });
  return [
    { x: x1 + r, y: y1 },
    { x: x2 - r, y: y1 },
    ...curve(
      [x2 - r, y1],
      [x2 - r * 0.31, y1],
      [x2, y1 + t * 0.31],
      [x2, y1 + t],
    ),
    { x: x2, y: y2 - b },
    ...curve(
      [x2, y2 - b],
      [x2, y2 - b * 0.33],
      [x2 - r * 0.31, y2],
      [x2 - r, y2],
    ),
    { x: x1 + r, y: y2 },
    ...curve(
      [x1 + r, y2],
      [x1 + r * 0.31, y2],
      [x1, y2 - b * 0.33],
      [x1, y2 - b],
    ),
    { x: x1, y: y1 + t },
    ...curve(
      [x1, y1 + t],
      [x1, y1 + t * 0.31],
      [x1 + r * 0.31, y1],
      [x1 + r, y1],
    ),
  ];
}

export function silhouette(yaw) {
  const c = Math.cos(yaw * D2R),
    s = Math.abs(Math.sin(yaw * D2R));
  const half = (BODY.w / 2) * c + (BODY.d / 2) * s;
  return { x1: BODY.cx - half, x2: BODY.cx + half, c, s, sign: Math.sign(yaw) };
}

export const circle = (x, y, r) =>
  `M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0Z`;

// One arm as a chain of shrinking circles along a curve through shoulder, elbow and hand.
// The circles are drawn twice (a thick ink pass, then the fill), so their union gets one
// clean outline with no corners, whatever the angle.
export function armGeom(side, a, yaw) {
  const S = [BODY.cx + side * ARM.sx, ARM.sy, 0];
  const E = add(S, dir(side, a[0], a[1]), ARM.up);
  const H = add(E, dir(side, a[2], a[3]), ARM.fore);
  const pts = [];
  for (let i = 0; i <= ARM.n; i++) {
    const t = i / ARM.n,
      u = 1 - t;
    const p3 = [0, 1, 2].map(
      (j) => u * u * S[j] + 2 * u * t * E[j] + t * t * H[j],
    );
    const p = project(p3, yaw);
    p.r = lerp(ARM.r0, ARM.r1, Math.pow(t, 0.85)) * p.k;
    pts.push(p);
  }
  return { pts, s: pts[0], tip: pts[pts.length - 1] };
}

export function legGeom(side, l, yaw) {
  const Hp = [BODY.cx + side * LEG.hx, LEG.hy, l[2] ?? 0];
  const A = add(Hp, dir(side, l[0], l[1]), LEG.len);
  const h = project(Hp, yaw),
    a = project(A, yaw);
  const pts = [];
  const vx = a.x - h.x,
    vy = a.y - h.y,
    len = Math.hypot(vx, vy);
  const end = len > 6 ? (len - 4) / len : 1;
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * end;
    pts.push({
      x: lerp(h.x, a.x, t),
      y: lerp(h.y, a.y, t),
      r: LEG.r * lerp(h.k, a.k, t),
    });
  }
  return { pts, h, a };
}

// Ink pass at the path radius with a centred stroke, fill pass shrunk by half the
// stroke, so a limb outline reads exactly like the body's centred outline.
export function blobPaths(pts, line) {
  const ink = pts.map((p) => circle(p.x, p.y, p.r)).join("");
  const fill = pts
    .map((p) => circle(p.x, p.y, Math.max(0.5, p.r - line / 2)))
    .join("");
  return { ink, fill };
}
function blobs(pts, line, fill, extra = "") {
  const d = blobPaths(pts, line);
  return `<g${extra}><path d="${d.ink}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${line}" stroke-linejoin="round"/><path d="${d.fill}" fill="${fill}"/></g>`;
}

/** Where a shoe sits and how big it is: one description for drawing it and for
 * the click area. */
export function shoeShape(g, yaw) {
  const vx = g.a.x - g.h.x,
    vy = g.a.y - g.h.y;
  const len = Math.hypot(vx, vy),
    c = clamp(len / (LEG.len * g.a.k));
  const rot = len > 2 ? Math.atan2(-vx, vy) / D2R : 0;
  const w = LEG.shoeW - 4 * (1 - c),
    h = LEG.shoeH + 6 * (1 - c);
  const ux = len > 2 ? vx / len : 0,
    uy = len > 2 ? vy / len : 1;
  return {
    cx: g.a.x + ux * 4.5 * c,
    cy: g.a.y + uy * 4.5 * c + (1 - c) * 3,
    rot,
    w,
    h,
    toe: Math.sin(yaw * D2R) * 4,
  };
}

function shoe(g, yaw, sole) {
  const { cx, cy, rot, w, h, toe } = shoeShape(g, yaw);
  const body = `<rect x="${f1(-w / 2 + toe)}" y="${f1(-h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(h / 2)}" fill="${C.shoe}"/>`;
  const tread = sole
    ? `<rect x="${f1(-w / 2 + 4 + toe)}" y="${f1(-h / 2 + 3)}" width="${f1(w - 8)}" height="${f1(h - 6)}" rx="${f1((h - 6) / 2)}" fill="#2b302d"/>`
    : "";
  return `<g transform="translate(${f1(cx)} ${f1(cy)}) rotate(${f1(rot)})">${body}${tread}</g>`;
}

export function eyesSvg(o, uid) {
  const kind = o.eyes || "open";
  const L = C.ink,
    W = LIMB_LINE;
  const [ex1, ex2] = FACE.eyeX,
    ey = FACE.eyeY;
  if (kind === "happy")
    return `<path d="M${ex1 - 13} 97Q${ex1} 80 ${ex1 + 13} 97M${ex2 - 13} 97Q${ex2} 80 ${ex2 + 13} 97" fill="none" stroke="${L}" stroke-width="${W + 1}" stroke-linecap="round"/>`;
  if (kind === "closed")
    return `<path d="M${ex1 - 13} 90Q${ex1} 101 ${ex1 + 13} 90M${ex2 - 13} 90Q${ex2} 101 ${ex2 + 13} 90" fill="none" stroke="${L}" stroke-width="${W + 1}" stroke-linecap="round"/>`;
  if (kind === "squeeze")
    return `<path d="M66 84L82 92L66 100M134 84L118 92L134 100" fill="none" stroke="${L}" stroke-width="${W + 1}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (kind === "dizzy") {
    const spin = o.spin || 0;
    const sp = (cx, dirn) => {
      let d = "";
      for (let i = 0; i <= 40; i++) {
        const t = i / 40,
          ang = (spin * dirn + t * 760) * D2R * dirn,
          r = 1.5 + t * 11;
        d +=
          (i ? "L" : "M") +
          f1(cx + Math.cos(ang) * r) +
          " " +
          f1(ey + Math.sin(ang) * r * 1.08);
      }
      return d;
    };
    return (
      `<ellipse cx="${ex1}" cy="${ey}" rx="16" ry="18" fill="${C.white}" stroke="${L}" stroke-width="${W}"/><ellipse cx="${ex2}" cy="${ey}" rx="16" ry="18" fill="${C.white}" stroke="${L}" stroke-width="${W}"/>` +
      `<path d="${sp(ex1, 1)}${sp(ex2, -1)}" fill="none" stroke="${L}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }
  const open = o.open ?? 1;
  if (open < 0.22)
    return `<path d="M${ex1 - 14} 93Q${ex1} 98 ${ex1 + 14} 93M${ex2 - 14} 93Q${ex2} 98 ${ex2 + 14} 93" fill="none" stroke="${L}" stroke-width="${W + 0.6}" stroke-linecap="round"/>`;
  const look = o.look,
    pr = kind === "wide" ? 6.5 : FACE.pupil;
  const dx = look ? look[0] * 5.5 : 3,
    dy = look ? look[1] * 5 : 3;
  const lid = o.lid || 0;
  return [ex1, ex2]
    .map((x, i) => {
      const ry = FACE.eyeRy,
        id = `e${uid}${i}`;
      let s = `<clipPath id="${id}"><ellipse cx="${x}" cy="${ey}" rx="16" ry="${ry}"/></clipPath>`;
      s += `<ellipse cx="${x}" cy="${ey}" rx="16" ry="${ry}" fill="${C.white}"/>`;
      s += `<g clip-path="url(#${id})"><circle class="blink-pupil" cx="${f1(x + dx)}" cy="${f1(ey + dy)}" r="${pr}" fill="${L}"/><circle cx="${f1(x + dx + 3)}" cy="${f1(ey + dy - 4)}" r="${kind === "wide" ? 2.6 : 3.4}" fill="${C.white}"/>`;
      if (lid > 0) {
        const ly = ey - ry + 2 * ry * lid,
          tilt = (o.lidTilt || 0) * (i ? -1 : 1);
        s += `<path d="M${x - 20} ${ey - ry - 4}H${x + 20}V${f1(ly + tilt)}L${x - 20} ${f1(ly - tilt)}Z" fill="${C.fill}"/><path d="M${x - 20} ${f1(ly - tilt)}L${x + 20} ${f1(ly + tilt)}" stroke="${L}" stroke-width="${W}"/>`;
      }
      s += `</g><ellipse cx="${x}" cy="${ey}" rx="16" ry="${ry}" fill="none" stroke="${L}" stroke-width="${W}"/>`;
      return open < 1
        ? `<g transform="translate(0 ${ey}) scale(1 ${f1(open * 100) / 100}) translate(0 ${-ey})">${s}</g>`
        : s;
    })
    .join("");
}

export function mouthSvg(o, uid) {
  const L = C.ink,
    W = LIMB_LINE,
    k = o.mouth || "smile",
    p = o.mp ?? 1;
  if (k === "smile")
    return `<path d="M87 118Q100 129 113 118" fill="none" stroke="${L}" stroke-width="${W}" stroke-linecap="round"/>`;
  if (k === "flat")
    return `<path d="M91 123H109" fill="none" stroke="${L}" stroke-width="${W}" stroke-linecap="round"/>`;
  if (k === "frown")
    return `<path d="M89 126Q100 117 111 126" fill="none" stroke="${L}" stroke-width="${W}" stroke-linecap="round"/>`;
  if (k === "wavy")
    return `<path d="M85 123q3.75 -4 7.5 0t7.5 0t7.5 0t7.5 0" fill="none" stroke="${L}" stroke-width="${W - 0.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (k === "o")
    return `<ellipse cx="100" cy="124" rx="${f1(4 + 3 * p)}" ry="${f1(4.5 + 4 * p)}" fill="${C.mouth}" stroke="${L}" stroke-width="${W}"/>`;
  if (k === "open" || k === "talk") {
    if (p < 0.12) return mouthSvg({ mouth: "smile" });
    const h = 4 + 13 * p,
      id = `m${uid}`;
    const d = `M87 118Q100 120 113 118Q${f1(112 - p)} ${f1(118 + h)} 100 ${f1(118 + h)}Q${f1(88 + p)} ${f1(118 + h)} 87 118Z`;
    return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${C.mouth}"/><ellipse cx="100" cy="${f1(119 + h)}" rx="9" ry="${f1(2 + 3 * p)}" fill="${C.tongue}" clip-path="url(#${id})"/><path d="${d}" fill="none" stroke="${L}" stroke-width="${W}" stroke-linejoin="round"/>`;
  }
  if (k === "gulp") {
    const rx = 8 + 10 * p,
      ry = 7 + 9 * p,
      id = `g${uid}`;
    return `<clipPath id="${id}"><ellipse cx="100" cy="127" rx="${f1(rx)}" ry="${f1(ry)}"/></clipPath><ellipse cx="100" cy="127" rx="${f1(rx)}" ry="${f1(ry)}" fill="${C.mouth}"/><ellipse cx="100" cy="${f1(127 + ry * 0.75)}" rx="${f1(rx * 0.65)}" ry="${f1(ry * 0.45)}" fill="${C.tongue}" clip-path="url(#${id})"/><ellipse cx="100" cy="127" rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="${L}" stroke-width="${W}"/>`;
  }
  if (k === "chew")
    return `<path d="M88 ${f1(121 - 2 * p)}Q94 ${f1(126 + 2 * p)} 100 ${f1(122 - p)}Q106 ${f1(126 + 2 * p)} 112 ${f1(121 - 2 * p)}" fill="none" stroke="${L}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return "";
}

export const STAND = {
  x: 0,
  y: 0,
  roll: 0,
  yaw: 0,
  L: [55, 0, 8, 0],
  R: [55, 0, 8, 0],
  legL: [0, 0],
  legR: [0, 0],
  eyes: "open",
  open: 1,
  look: null,
  lid: 0,
  mouth: "smile",
  mp: 1,
  blush: 1,
};

// Draw one frame. o = pose fields; scene = { back, mid, front } extra SVG in scene space,
// o.attach = extra SVG that moves with the body (sweat drop, cheek puff); o.behind is
// the same but drawn under the body (a cape).
export function drawBlink(o, uid) {
  o = Object.assign({}, STAND, o);
  const yaw = o.yaw,
    sil = silhouette(yaw);
  const body = boxPath(sil.x1, sil.x2, BODY.top, BODY.bottom);
  const arms = {},
    legs = {};
  for (const [key, side] of [
    ["L", -1],
    ["R", 1],
  ]) {
    const g = armGeom(side, o[key], yaw);
    let layer = (o.layer && o.layer[key]) || "auto";
    if (layer === "auto") {
      const inside =
        g.tip.x > sil.x1 + 6 &&
        g.tip.x < sil.x2 - 6 &&
        g.tip.y > BODY.top &&
        g.tip.y < BODY.bottom;
      layer = g.s.z < -14 ? "back" : inside && g.tip.z > 4 ? "front" : "side";
    }
    arms[key] = { g, layer };
    const lg = legGeom(side, o["leg" + key], yaw);
    legs[key] = { g: lg, front: lg.a.z > 22 };
  }
  const order = (a, b) => a.g.s.z - b.g.s.z;
  const armSvg = (key) => {
    const { g, layer } = arms[key];
    if (layer === "back") return blobs(g.pts, LIMB_LINE, C.fill);
    const mid = `${uid}${key}`;
    // A shoulder on the outline (front view) hides the whole root; a shoulder in the
    // middle of a visible side face keeps most of its outline, only the joint blends in.
    const edge = Math.min(Math.abs(g.s.x - sil.x1), Math.abs(g.s.x - sil.x2));
    let r = lerp(g.s.r + 10, g.s.r * 0.55, clamp(edge / 14));
    // An arm reaching across the front of the body keeps its full outline there.
    const inward = Math.min(g.tip.x - sil.x1, sil.x2 - g.tip.x);
    if (clamp(inward / 14) * clamp(g.tip.z / 10) > 0.5) r = 0;
    // Inside the body the root's outline is hidden. The circle is wide enough that the
    // arm's own contour crosses its edge head-on, so no faint sliver is left behind.
    const mask = `<mask id="am${mid}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="600" height="600"><rect x="-200" y="-200" width="600" height="600" fill="#fff"/><circle cx="${f1(g.s.x)}" cy="${f1(g.s.y)}" r="${f1(r)}" fill="#000" clip-path="url(#bc${uid})"/></mask>`;
    const d = blobPaths(g.pts, LIMB_LINE);
    if (r < 1)
      return `<path d="${d.ink}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${LIMB_LINE}" stroke-linejoin="round"/><path d="${d.fill}" fill="${C.fill}"/>`;
    return `${mask}<path d="${d.ink}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${LIMB_LINE}" stroke-linejoin="round" mask="url(#am${mid})"/><path d="${d.fill}" fill="${C.fill}"/>`;
  };
  const pick = (layer) =>
    Object.keys(arms)
      .filter((k) => arms[k].layer === layer)
      .sort((a, b) => order(arms[a], arms[b]))
      .map(armSvg)
      .join("");
  const legBack = ["L", "R"]
    .filter((k) => !legs[k].front)
    .sort((a, b) => legs[a].g.h.z - legs[b].g.h.z)
    .map(
      (k) =>
        blobs(legs[k].g.pts, LIMB_LINE, C.fill) + shoe(legs[k].g, yaw, false),
    )
    .join("");
  const legFront = ["L", "R"]
    .filter((k) => legs[k].front)
    .map((k) => shoe(legs[k].g, yaw, true))
    .join("");

  let bodySvg = `<clipPath id="bc${uid}"><path d="${body}"/></clipPath><path class="blink-body" d="${body}" fill="${C.fill}"/>`;
  if (sil.s > 0.01) {
    const w = BODY.d * sil.s;
    const x0 = sil.sign > 0 ? sil.x1 : sil.x2 - w;
    const gid = `sg${uid}`;
    const [a, b] = sil.sign > 0 ? [x0, x0 + w + 8] : [x0 + w, x0 - 8];
    bodySvg +=
      `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f1(a)}" x2="${f1(b)}" y1="0" y2="0"><stop offset="0" stop-color="${C.side}"/><stop offset="${f1((w / (w + 8)) * 100) / 100}" stop-color="${C.side}"/><stop offset="1" stop-color="${C.side}" stop-opacity="0"/></linearGradient>` +
      `<rect x="${f1(Math.min(a, b))}" y="20" width="${f1(w + 8)}" height="170" fill="url(#${gid})" clip-path="url(#bc${uid})"/>`;
  }
  bodySvg += `<rect x="0" y="152" width="200" height="40" fill="${C.shade}" clip-path="url(#bc${uid})"/>`;
  const faceT = `matrix(${f1(sil.c * 1000) / 1000} 0 0 1 ${f1(BODY.cx - BODY.cx * sil.c + (BODY.d / 2) * Math.sin(yaw * D2R))} 0)`;
  let face = `<rect x="56" y="46" width="30" height="9" rx="4.5" fill="${C.hi}" opacity=".75"/>`;
  const bl = o.blush;
  face += FACE.blushX
    .map(
      (x) =>
        `<ellipse cx="${x}" cy="${FACE.blushY}" rx="${f1(11 * bl)}" ry="${f1(6.5 * bl)}" fill="${C.blush}"/>`,
    )
    .join("");
  face += eyesSvg(o, uid) + mouthSvg(o, uid) + (o.faceExtra || "");
  const bodyLine = `<path d="${body}" fill="none" stroke="${C.ink}" stroke-width="${BODY.line}" stroke-linejoin="round"/>`;

  const pivot = o.pivot || [100, 190];
  const T = poseTransform({ ...o, pivot }).svg;
  const figureCore =
    pick("back") +
    legBack +
    (o.behind || "") +
    bodySvg +
    bodyLine +
    (o.armsOver ? "" : pick("side")) +
    `<g transform="${faceT}">${face}</g>` +
    legFront +
    (o.armsOver ? "" : pick("front")) +
    (o.attach || "");
  const lift = clamp(-o.y / 110);
  const shw = ((sil.x2 - sil.x1) / 120) * 56 * (1 - lift * 0.55);
  const shadow = o.noShadow
    ? ""
    : `<ellipse cx="${f1(100 + o.x)}" cy="${o.groundY || 194}" rx="${f1(shw)}" ry="${f1(5 * (1 - lift * 0.4))}" fill="#000" opacity="${f1(0.1 * (1 - lift * 0.6) * 100) / 100}"/>`;
  let s = (o.back || "") + shadow;
  if (o.clipY != null)
    s += `<clipPath id="fc${uid}"><rect x="-100" y="-100" width="400" height="${o.clipY + 100}"/></clipPath><g clip-path="url(#fc${uid})"><g transform="${T}">${figureCore}</g></g>`;
  else s += `<g transform="${T}">${figureCore}</g>`;
  s += o.mid || "";
  if (o.armsOver) {
    const over = `<g transform="${T}">${pick("side")}${pick("front")}</g>`;
    s +=
      o.overClipY != null
        ? `<clipPath id="oc${uid}"><rect x="-100" y="-100" width="400" height="${o.overClipY + 100}"/></clipPath><g clip-path="url(#oc${uid})">${over}</g>`
        : over;
  }
  return s + (o.front || "");
}
