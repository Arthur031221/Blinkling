import { capsule, roundedRect, transformPolygon } from "./silhouette.mjs";
const NS = "http://www.w3.org/2000/svg";
export const colors = Object.freeze({
  ink: "#0c0e0d",
  green: "#3ddc97",
  greenDark: "#1f9e68",
  shade: "#2cc283",
  bone: "#f5f5f4",
  cheek: "#ff8fb1",
});
/** Port of ~/reels/house-style/mascot/blink.js: same joints, proportions, face,
 * palette and outlined limbs. Round the block for desktop; omit its ground shadow.
 * Motion is computed from a monotonic clock instead of a video/GSAP timeline. */
export function mountBlink(host) {
  const contours = [];
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent?.append(n);
    return n;
  }
  function joint(parent, x = 0, y = 0) {
    const node = el("g", {}, parent);
    return {
      node,
      x,
      y,
      r: 0,
      sx: 1,
      sy: 1,
      apply() {
        node.setAttribute(
          "transform",
          `translate(${this.x},${this.y}) rotate(${this.r}) scale(${this.sx},${this.sy})`,
        );
      },
    };
  }
  function contour(node, polygon) {
    contours.push({ node, polygon });
    return node;
  }
  function limb(parent, len1, len2, hand) {
    const upper = joint(parent),
      lower = joint(upper.node, 0, len1);
    for (const [node, length] of [
      [upper.node, len1],
      [lower.node, len2],
    ]) {
      contour(
        el(
          "line",
          {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: length,
            stroke: colors.ink,
            "stroke-width": 34,
            "stroke-linecap": "round",
          },
          node,
        ),
        capsule(0, 0, 0, length, 17),
      );
      el(
        "line",
        {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: length,
          stroke: colors.greenDark,
          "stroke-width": 18,
          "stroke-linecap": "round",
        },
        node,
      );
    }
    if (hand)
      contour(
        el(
          "circle",
          {
            cx: 0,
            cy: len2 + 6,
            r: 24,
            fill: colors.bone,
            stroke: colors.ink,
            "stroke-width": 8,
          },
          lower.node,
        ),
        roundedRect(-28, len2 - 22, 56, 56, 28),
      );
    else
      contour(
        el(
          "rect",
          { x: -34, y: 22, width: 68, height: 30, rx: 15, fill: colors.ink },
          lower.node,
        ),
        roundedRect(-34, 22, 68, 30, 15),
      );
    return { upper, lower };
  }
  const svg = el(
    "svg",
    { viewBox: "-210 -405 420 430", role: "img", "aria-label": "Blink" },
    host,
  );
  const lift = joint(svg),
    squash = joint(lift.node),
    legs = {},
    arms = {};
  for (const [side, x] of [
    ["L", -52],
    ["R", 52],
  ]) {
    const hip = joint(squash.node, x, -78),
      l = limb(hip.node, 40, 30, false);
    legs[side] = { hip, knee: l.lower };
  }
  function arm(side) {
    const shoulder = joint(squash.node, side === "L" ? -112 : 112, -232),
      l = limb(shoulder.node, 74, 62, true);
    arms[side] = { shoulder, elbow: l.lower };
  }
  arm("L");
  const body = el("g", {}, squash.node);
  contour(
    el(
      "rect",
      {
        x: -120,
        y: -356,
        width: 240,
        height: 280,
        rx: 64,
        fill: colors.green,
        stroke: colors.ink,
        "stroke-width": 10,
      },
      body,
    ),
    roundedRect(-125, -361, 250, 290, 69),
  );
  el(
    "path",
    {
      d: "M -115 -116 H 115 Q 108 -81 64 -81 H -64 Q -108 -81 -115 -116 Z",
      fill: colors.shade,
    },
    body,
  );
  el(
    "rect",
    { x: -82, y: -334, width: 54, height: 16, rx: 8, fill: "#8ff0c4" },
    body,
  );
  const face = joint(body, 0, -248),
    eyes = joint(face.node),
    pupils = joint(eyes.node);
  for (const x of [-50, 50]) {
    el(
      "ellipse",
      {
        cx: x,
        cy: 0,
        rx: 31,
        ry: 38,
        fill: colors.bone,
        stroke: colors.ink,
        "stroke-width": 8,
      },
      eyes.node,
    );
    el("circle", { cx: x, cy: 6, r: 16, fill: colors.ink }, pupils.node);
    el("circle", { cx: x + 6, cy: 0, r: 5, fill: colors.bone }, pupils.node);
  }
  for (const x of [-86, 86])
    el(
      "ellipse",
      { cx: x, cy: 52, rx: 19, ry: 10, fill: colors.cheek, opacity: 0.75 },
      face.node,
    );
  const smile = el(
    "path",
    {
      d: "M -28 50 Q 0 78 28 50",
      fill: "none",
      stroke: colors.ink,
      "stroke-width": 9,
      "stroke-linecap": "round",
    },
    face.node,
  );
  const mouth = el("g", { opacity: 0 }, face.node);
  el(
    "path",
    {
      d: "M -26 48 Q 0 44 26 48 Q 24 88 0 90 Q -24 88 -26 48 Z",
      fill: colors.ink,
    },
    mouth,
  );
  el(
    "path",
    {
      d: "M -14 76 Q 0 66 14 76 Q 8 86 0 87 Q -8 86 -14 76 Z",
      fill: colors.cheek,
    },
    mouth,
  );
  arm("R");
  const all = [
    lift,
    squash,
    face,
    eyes,
    pupils,
    ...Object.values(legs).flatMap((l) => [l.hip, l.knee]),
    ...Object.values(arms).flatMap((a) => [a.shoulder, a.elbow]),
  ];
  function pose(
    time,
    {
      mode = "peek",
      waveAt = -100,
      dropAt = -100,
      talking = false,
      velocity = 0,
    } = {},
  ) {
    const breath = Math.sin(time * 1.8),
      blinkPhase = (time + 1.3) % 4.6,
      blink =
        blinkPhase < 0.14
          ? Math.max(0.08, Math.abs(blinkPhase - 0.07) / 0.07)
          : 1;
    lift.y = breath * 3;
    squash.sx = 1 + breath * 0.008;
    squash.sy = 1 - breath * 0.008;
    squash.r = 0;
    face.r = Math.sin(time * 1.5) * 1.3;
    eyes.sx = 1;
    eyes.sy = blink;
    pupils.x = Math.sin(time * 0.42) * 8;
    pupils.y = Math.sin(time * 0.7) * 2;
    for (const [side, s] of [
      ["L", 1],
      ["R", -1],
    ]) {
      arms[side].shoulder.r = s * (14 + Math.sin(time * 2.1 + s) * 3);
      arms[side].elbow.r = 0;
      legs[side].hip.r = 0;
      legs[side].knee.r = 0;
    }
    const wave = time - waveAt;
    if (wave >= 0 && wave < 1.5) {
      const q = Math.min(1, wave / 0.23, (1.5 - wave) / 0.3);
      arms.R.shoulder.r = -14 - 136 * q;
      arms.R.elbow.r = Math.sin(wave * 22) * 30 * q;
      pupils.x = 5;
    }
    let open = talking && Math.sin(time * 17) > 0.1;
    if (mode === "drag") {
      squash.sx = 0.88;
      squash.sy = 1.12;
      squash.r = Math.max(-14, Math.min(14, -velocity * 0.04));
      eyes.sx = 1.15;
      eyes.sy = 1.15;
      arms.L.shoulder.r = 156;
      arms.R.shoulder.r = -156;
      legs.L.knee.r = -18;
      legs.R.knee.r = 18;
      open = true;
    }
    const drop = time - dropAt;
    if (drop >= 0 && drop < 0.5) {
      const q = Math.sin(drop * 23) * Math.exp(-drop * 8);
      lift.y -= Math.abs(q) * 20;
      squash.sx += q * 0.18;
      squash.sy -= q * 0.18;
    }
    smile.setAttribute("opacity", open ? 0 : 1);
    mouth.setAttribute("opacity", open ? 1 : 0);
    all.forEach((j) => j.apply());
  }
  eyes.node.append(pupils.node);
  pose(0);
  return {
    svg,
    pose,
    polygons: () =>
      contours
        .map(({ node, polygon }) =>
          transformPolygon(polygon, node.getScreenCTM()),
        )
        .filter((p) =>
          p.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)),
        ),
    body,
    arms,
    eyes,
  };
}
