import { capsule, roundedRect, transformPolygon } from "./silhouette.mjs";
import { spring } from "./state.mjs";
import { springs } from "../shared/motion.mjs";
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
  const brows = el(
    "path",
    {
      d: "M -78 -50 l38 -8 M 40 -58 l38 8",
      stroke: colors.ink,
      "stroke-width": 8,
      fill: "none",
      opacity: 0,
    },
    face.node,
  );
  const thoughts = [-18, 0, 18].map((x) =>
    el(
      "circle",
      { cx: x, cy: -80, r: 5, fill: colors.ink, opacity: 0 },
      face.node,
    ),
  );
  // The connection dot exists only for trouble (N3.11): it is hidden while
  // connected, so a permanent dot never becomes noise.
  const status = el(
    "circle",
    {
      cx: -100,
      cy: -104,
      r: 14,
      style: "fill: var(--warn)",
      stroke: colors.ink,
      "stroke-width": 6,
      opacity: 0,
      "data-connection": "starting",
    },
    body,
  );
  // The state badge sits on the visible shoulder, so a state reads at the peek.
  const badge = joint(body, -70, -352);
  const badgeDisc = el(
    "circle",
    { r: 34, stroke: colors.ink, "stroke-width": 7, fill: colors.bone },
    badge.node,
  );
  const badgeGlyph = el(
    "path",
    {
      d: "",
      fill: "none",
      stroke: colors.ink,
      "stroke-width": 6,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    badge.node,
  );
  const badgeDot = el(
    "circle",
    { r: 3.6, fill: colors.ink, opacity: 0 },
    badge.node,
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
    badge,
    squash,
    face,
    eyes,
    pupils,
    ...Object.values(legs).flatMap((l) => [l.hip, l.knee]),
    ...Object.values(arms).flatMap((a) => [a.shoulder, a.elbow]),
  ];
  // Glyphs in a 60-unit box around the badge centre, one per face that needs a mark.
  const glyphs = {
    lock: "M -13 -2 H 13 V 20 H -13 Z M -8 -2 V -10 A 8 8 0 0 1 8 -10 V -2",
    permission: "M -9 -12 A 9 9 0 1 1 5 -4 Q 0 0 0 7",
    "usage-limit":
      "M -11 -19 H 11 M -11 19 H 11 M -9 -19 C -9 -2 9 -2 9 19 M 9 -19 C 9 -2 -9 -2 -9 19",
    error: "M 0 -18 V 4",
    watching: "M -19 0 Q 0 -17 19 0 Q 0 17 -19 0 Z",
  };
  // Marks that ask for attention are amber; the quiet ones stay bone.
  const amber = new Set(["permission", "usage-limit", "error"]);
  let badgeFace = "idle",
    badgeScale = { value: 0, velocity: 0 },
    lastTime = 0;
  function pose(
    time,
    {
      mode = "peek",
      waveAt = -100,
      dropAt = -100,
      talking = false,
      velocity = 0,
      expression = "idle",
      face: faceName = expression,
      peek = 0,
      catchAt = -100,
      connection = "starting",
      edge = "right",
      hanging = false,
    } = {},
  ) {
    const breath = Math.sin(time * 1.8),
      blinkPhase = (time + 1.3) % 4.6,
      blink =
        blinkPhase < 0.14
          ? Math.max(0.08, Math.abs(blinkPhase - 0.07) / 0.07)
          : 1;
    lift.r = hanging ? 180 : 0;
    lift.y =
      (hanging ? -432 : 0) +
      breath * 3 +
      (expression === "finished" ? Math.sin(time * 12) * 3 : 0);
    squash.sx = 1 + breath * 0.008;
    squash.sy = 1 - breath * 0.008;
    squash.r = 0;
    face.r = (hanging ? -180 : 0) + Math.sin(time * 1.5) * 1.3;
    // Half of Blink is off screen at the peek: slide the face onto the visible
    // half and shrink it a little so both eyes and the state read there.
    const inward = edge === "right" ? -1 : edge === "left" ? 1 : 0,
      shrink = 1 - 0.2 * peek;
    // Which side of Blink stays on screen; the mark and dot go there.
    const side = (inward || -1) * (hanging ? -1 : 1);
    face.x = inward * 62 * peek;
    face.sx = shrink;
    face.sy = shrink;
    // Eyes per face: sealed for the lock, heavy for the usage limit, wide and
    // scanning while watching, looking up while thinking.
    eyes.sx = faceName === "watching" ? 1.1 : 1;
    eyes.sy =
      faceName === "lock"
        ? 0.1
        : blink *
          (faceName === "usage-limit"
            ? 0.5
            : faceName === "watching"
              ? 1.15
              : 1);
    pupils.x =
      faceName === "watching"
        ? Math.sin(time * 1.7) * 14
        : Math.sin(time * 0.42) * 8;
    pupils.y =
      (faceName === "thinking" ? -14 : faceName === "usage-limit" ? 10 : 0) +
      Math.sin(time * 0.7) * 2;
    brows.setAttribute(
      "opacity",
      faceName === "permission" || faceName === "error" ? 1 : 0,
    );
    thoughts.forEach((dot, i) =>
      dot.setAttribute(
        "opacity",
        faceName === "thinking"
          ? 0.4 + (Math.sin(time * 5 - i * 1.2) + 1) * 0.3
          : 0,
      ),
    );
    // Reconnecting pulses, disconnected holds; connected shows nothing.
    status.setAttribute(
      "opacity",
      connection === "retrying"
        ? 0.55 + (Math.sin(time * 5) + 1) * 0.225
        : connection === "blocked"
          ? 1
          : 0,
    );
    status.dataset.connection = connection;
    status.setAttribute("cx", 100 * side);
    smile.setAttribute(
      "d",
      faceName === "error"
        ? "M -28 66 Q 0 42 28 66"
        : faceName === "lock"
          ? "M -18 58 H 18"
          : faceName === "usage-limit"
            ? "M -24 60 Q -12 52 0 60 T 24 60"
            : "M -28 50 Q 0 78 28 50",
    );
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
    const catching = time - catchAt;
    let open =
      faceName === "permission" ||
      (faceName === "talking" && talking && Math.sin(time * 17) > 0.1) ||
      (catching >= 0 && catching < 0.5);
    if (catching >= 0 && catching < 0.5)
      lift.y -= Math.sin((catching / 0.5) * Math.PI) * 18;
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
    // The badge pops in and out on the crisp spring, and reverses from where it is.
    if (faceName !== badgeFace && glyphs[faceName]) {
      badgeFace = faceName;
      badgeGlyph.setAttribute("d", glyphs[faceName]);
      badgeDisc.style.fill = amber.has(faceName) ? "var(--warn)" : colors.bone;
      badgeDot.setAttribute("opacity", faceName === "error" ? 1 : 0);
      badgeDot.setAttribute("cy", 16);
    }
    const dt = Math.min(0.05, Math.max(0, time - lastTime));
    lastTime = time;
    badgeScale = spring(
      badgeScale.value,
      glyphs[faceName] ? 1 : 0,
      badgeScale.velocity,
      dt,
      springs.crisp,
    );
    badge.x = 70 * side;
    badge.sx = badge.sy = Math.max(0, badgeScale.value);
    badge.r = hanging ? 180 : 0;
    badge.node.setAttribute(
      "opacity",
      Math.min(1, Math.max(0, badgeScale.value)),
    );
    smile.setAttribute("opacity", open ? 0 : 1);
    mouth.setAttribute("opacity", open ? 1 : 0);
    all.forEach((j) => j.apply());
  }
  eyes.node.append(pupils.node);
  pose(0);
  return {
    svg,
    rig: {
      svg,
      root: squash,
      face,
      eyes,
      pupils,
      brows,
      thoughts,
      status,
      badge,
      smile,
      mouth,
      arms,
      legs,
    },
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
