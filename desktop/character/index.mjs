import { capsule, roundedRect, transformPolygon } from "./silhouette.mjs";
const NS = "http://www.w3.org/2000/svg";
/** How long a dizzy Blink sways before it recovers, in seconds. */
export const DIZZY_FOR = 2.6;
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
  const cheeks = [-86, 86].map((x) =>
    el(
      "ellipse",
      { cx: x, cy: 52, rx: 19, ry: 10, fill: colors.cheek, opacity: 0.75 },
      face.node,
    ),
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
  // Thought dots above each eye and the lock and sleep marks sit on both
  // sides of the face, so any half of Blink showing at the peek still reads.
  const thoughts = [-64, -50, -36, 36, 50, 64].map((x) =>
    el(
      "circle",
      { cx: x, cy: -88, r: 5, fill: colors.ink, opacity: 0 },
      face.node,
    ),
  );
  const marks = {};
  for (const [name, shape] of [
    [
      "lock",
      (g) => {
        el(
          "path",
          {
            d: "M -9 -8 V -15 a9 9 0 0 1 18 0 V -8",
            fill: "none",
            stroke: colors.ink,
            "stroke-width": 5,
          },
          g,
        );
        el(
          "rect",
          { x: -13, y: -8, width: 26, height: 20, rx: 5, fill: colors.ink },
          g,
        );
      },
    ],
    [
      "sleep",
      (g) =>
        el(
          "path",
          {
            d: "M -10 -10 H 10 L -10 10 H 10",
            fill: "none",
            stroke: colors.ink,
            "stroke-width": 6,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          },
          g,
        ),
    ],
  ])
    marks[name] = [-92, 92].map((x) => {
      const g = el(
        "g",
        { opacity: 0, transform: `translate(${x},-88)` },
        face.node,
      );
      shape(g);
      return g;
    });
  const status = el(
    "circle",
    {
      cx: -90,
      cy: -216,
      r: 10,
      visibility: "hidden",
      "data-connection": "ok",
    },
    body,
  );
  status.style.fill = "var(--warn)";
  // A sweat drop for a held Blink, spiral eyes and orbiting stars for a dizzy
  // one, and a heart for a pat on the head. All hidden until a pose asks.
  const sweat = el(
    "path",
    {
      d: "M 0 -22 Q 16 2 0 14 Q -16 2 0 -22 Z",
      fill: "#9fd8ff",
      stroke: colors.ink,
      "stroke-width": 5,
      opacity: 0,
    },
    face.node,
  );
  const spirals = [-50, 50].map((x) =>
    el(
      "path",
      {
        d: "M 0 -4 a4 4 0 1 1 -4 4 a10 10 0 1 1 10 10 a17 17 0 1 1 -17 -17 a24 24 0 1 1 24 24",
        transform: `translate(${x},0)`,
        fill: "none",
        stroke: colors.ink,
        "stroke-width": 5,
        "stroke-linecap": "round",
        opacity: 0,
      },
      face.node,
    ),
  );
  const stars = [0, 1, 2].map(() =>
    el(
      "path",
      {
        d: "M 0 -14 L 4 -4 L 14 -4 L 6 3 L 9 13 L 0 7 L -9 13 L -6 3 L -14 -4 L -4 -4 Z",
        fill: "#ffd84a",
        stroke: colors.ink,
        "stroke-width": 4,
        "stroke-linejoin": "round",
        opacity: 0,
      },
      face.node,
    ),
  );
  const heart = el(
    "path",
    {
      d: "M 0 12 C -22 -4 -16 -22 0 -12 C 16 -22 22 -4 0 12 Z",
      fill: colors.cheek,
      stroke: colors.ink,
      "stroke-width": 4,
      "stroke-linejoin": "round",
      opacity: 0,
    },
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
  /** Eyes, pupils, brows, mouth and marks for each state of the face table.
   * Every sign is mirrored so either half of Blink at the peek shows it. */
  const LOOKS = {
    idle: { eye: 1, brows: null, mouth: "smile", scan: 0 },
    lock: { eye: 0.08, brows: null, mouth: "flat", scan: 0, mark: "lock" },
    permission: { eye: 1.18, brows: "worried", mouth: "open", scan: 0 },
    "usage-limit": {
      eye: 0.42,
      brows: null,
      mouth: "flat",
      scan: 0,
      mark: "sleep",
    },
    error: { eye: 0.78, brows: "angry", mouth: "frown", scan: 0 },
    thinking: { eye: 1, brows: null, mouth: "smile", scan: 0, look: -14 },
    talking: { eye: 0.7, brows: null, mouth: "talk", scan: 0 },
    watching: { eye: 1.14, brows: null, mouth: "smile", scan: 16 },
  };
  const BROWS = {
    worried: "M -78 -44 l38 -16 M 40 -60 l38 16",
    angry: "M -78 -62 l38 16 M 40 -46 l38 -16",
  };
  const MOUTHS = {
    smile: "M -28 50 Q 0 78 28 50",
    frown: "M -28 66 Q 0 42 28 66",
    flat: "M -20 58 H 20",
  };
  function pose(
    time,
    {
      mode = "peek",
      waveAt = -100,
      dropAt = -100,
      catchAt = -100,
      velocity = 0,
      expression = "idle",
      face: faceName = "idle",
      dot = null,
      edge = "right",
      hanging = false,
      dizzyAt = -100,
      touch = null,
    } = {},
  ) {
    const look = LOOKS[faceName] ?? LOOKS.idle;
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
    eyes.sx = 1;
    eyes.sy = look.eye * blink;
    pupils.x = look.scan
      ? Math.sin(time * 2.2) * look.scan
      : Math.sin(time * 0.42) * 8;
    pupils.y = (look.look ?? 0) + Math.sin(time * 0.7) * 2;
    brows.setAttribute("d", BROWS[look.brows] ?? BROWS.worried);
    brows.setAttribute("opacity", look.brows ? 1 : 0);
    thoughts.forEach((dot, i) =>
      dot.setAttribute(
        "opacity",
        faceName === "thinking"
          ? 0.4 + (Math.sin(time * 5 - (i % 3) * 1.2) + 1) * 0.3
          : 0,
      ),
    );
    for (const [name, group] of Object.entries(marks))
      group.forEach((g) =>
        g.setAttribute("opacity", look.mark === name ? 1 : 0),
      );
    status.setAttribute("visibility", dot ? "visible" : "hidden");
    status.dataset.connection = dot ?? "ok";
    status.setAttribute(
      "cx",
      (edge === "right" ? -90 : edge === "left" ? 90 : 0) * (hanging ? -1 : 1),
    );
    smile.setAttribute("d", MOUTHS[look.mouth] ?? MOUTHS.smile);
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
    let open =
      look.mouth === "open" ||
      (look.mouth === "talk" && Math.sin(time * 17) > 0.1);
    let nervous = 0;
    if (mode === "drag") {
      // Held by the scruff: it does not stretch into a box. It trembles, its
      // eyes go wide, a sweat drop slides down and its legs dangle and kick.
      nervous = 1;
      const shake = Math.sin(time * 26);
      squash.sx = 1.02 + shake * 0.015;
      squash.sy = 0.99 - shake * 0.015;
      squash.r =
        Math.max(-14, Math.min(14, -velocity * 0.04)) +
        Math.sin(time * 15) * 4.5;
      eyes.sx = 1.12;
      eyes.sy = 1.2;
      pupils.x *= 0.3;
      pupils.y = -4;
      brows.setAttribute("d", BROWS.worried);
      brows.setAttribute("opacity", 1);
      arms.L.shoulder.r = 150 + Math.sin(time * 19) * 5;
      arms.R.shoulder.r = -150 - Math.sin(time * 19 + 1) * 5;
      legs.L.hip.r = Math.sin(time * 9) * 12;
      legs.R.hip.r = -Math.sin(time * 9 + 1) * 12;
      legs.L.knee.r = -18 + Math.sin(time * 9) * 10;
      legs.R.knee.r = 18 - Math.sin(time * 9 + 1) * 10;
      smile.setAttribute(
        "d",
        `M -26 62 Q -13 ${52 + shake * 3} 0 62 Q 13 ${72 - shake * 3} 26 62`,
      );
      open = false;
    }
    const slide = (time * 0.9) % 1;
    sweat.setAttribute("opacity", nervous ? 1 - slide * slide : 0);
    sweat.setAttribute(
      "transform",
      `translate(${hanging ? -92 : 92},${-56 + slide * 70}) scale(${1 - slide * 0.25})`,
    );
    // Dizzy after a spin: spiral eyes, stars on a ring and a sway that fades.
    const dizzy = time - dizzyAt;
    const dizzyOn = !nervous && dizzy >= 0 && dizzy < DIZZY_FOR;
    if (dizzyOn) {
      const fade = Math.min(1, (DIZZY_FOR - dizzy) / 0.6);
      squash.r = Math.sin(dizzy * 5.5) * 9 * fade;
      lift.y += Math.abs(Math.sin(dizzy * 5.5)) * 4;
      squash.sx = 1 + Math.sin(dizzy * 11) * 0.02 * fade;
      eyes.sy = 0.001;
      pupils.x = 0;
      arms.L.shoulder.r = 40 + Math.sin(dizzy * 5.5) * 14;
      arms.R.shoulder.r = -40 + Math.sin(dizzy * 5.5) * 14;
      legs.L.hip.r = Math.sin(dizzy * 5.5) * 6;
      legs.R.hip.r = Math.sin(dizzy * 5.5 + 3) * 6;
      smile.setAttribute("d", "M -22 60 Q -10 50 0 60 Q 10 70 22 60");
      stars.forEach((star, i) => {
        const a = dizzy * 4.2 + (i * Math.PI * 2) / 3;
        star.setAttribute(
          "transform",
          `translate(${Math.cos(a) * 82},${-104 + Math.sin(a) * 18}) scale(${0.8 + Math.sin(a) * 0.2})`,
        );
        star.setAttribute("opacity", fade);
      });
      spirals.forEach((sp, i) => {
        sp.setAttribute(
          "transform",
          `translate(${i ? 50 : -50},0) rotate(${(i ? -1 : 1) * dizzy * 360})`,
        );
        sp.setAttribute("opacity", fade);
      });
    } else {
      stars.forEach((star) => star.setAttribute("opacity", 0));
      spirals.forEach((sp) => sp.setAttribute("opacity", 0));
    }
    // Touch reactions, one per part. A held or dizzy Blink keeps its own pose.
    cheeks.forEach((c) => {
      c.setAttribute("opacity", 0.75);
      c.removeAttribute("transform");
    });
    heart.setAttribute("opacity", 0);
    if (!nervous && !dizzyOn && touch) {
      const t = Math.sin(time * 18);
      if (touch.part === "head") {
        // A pat: eyes squint shut, a heart floats up, the head leans in.
        eyes.sy = 0.12;
        face.r += Math.sin(time * 5) * 3;
        squash.sy -= 0.03;
        heart.setAttribute("opacity", 1);
        heart.setAttribute(
          "transform",
          `translate(0,${-96 - ((time * 40) % 24)}) scale(${0.9 + t * 0.05})`,
        );
        open = false;
      } else if (touch.part === "cheek") {
        // Blushing: the cheeks swell and glow and Blink looks away shyly.
        cheeks.forEach((c, i) => {
          c.setAttribute("opacity", 1);
          c.setAttribute(
            "transform",
            `translate(${i ? 86 : -86},52) scale(1.35) translate(${i ? -86 : 86},-52)`,
          );
        });
        eyes.sy = Math.min(eyes.sy, 0.5);
        squash.sx += 0.03 + t * 0.01;
        squash.sy -= 0.03;
        pupils.x = touch.side * 8;
      } else if (touch.part === "belly") {
        // Ticklish: a giggle jiggle with the mouth open.
        squash.sx += t * 0.05;
        squash.sy -= t * 0.05;
        squash.r = t * 3;
        eyes.sy = Math.min(eyes.sy, 0.35);
        open = true;
      } else if (touch.part === "hand") {
        // The touched hand shakes in greeting.
        const arm = touch.side < 0 ? arms.L : arms.R;
        arm.shoulder.r = touch.side * -(70 + Math.sin(time * 20) * 14);
        arm.elbow.r = Math.sin(time * 22) * 24;
        pupils.x = touch.side * 10;
      } else if (touch.part === "foot") {
        // Ticklish feet: a hop and a kick of the touched leg.
        const leg = touch.side < 0 ? legs.L : legs.R;
        lift.y -= Math.abs(Math.sin(time * 9)) * 14;
        leg.hip.r = touch.side * Math.sin(time * 18) * 22;
        leg.knee.r = Math.sin(time * 18) * 18;
        eyes.sy = Math.min(eyes.sy, 0.5);
        open = true;
      }
    }
    const drop = time - dropAt;
    if (drop >= 0 && drop < 0.5) {
      const q = Math.sin(drop * 23) * Math.exp(-drop * 8);
      lift.y -= Math.abs(q) * 20;
      squash.sx += q * 0.18;
      squash.sy -= q * 0.18;
    }
    // Catching what the user took: a hop and an open mouth to swallow it.
    const caught = time - catchAt;
    if (caught >= 0 && caught < 0.6) {
      const q = Math.sin(caught * 18) * Math.exp(-caught * 6);
      lift.y -= Math.abs(q) * 26;
      squash.sx += q * 0.12;
      squash.sy -= q * 0.12;
      open = true;
    }
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
      cheeks,
      sweat,
      spirals,
      stars,
      heart,
      thoughts,
      marks,
      status,
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
