/* Port of ~/reels/house-style/mascot/blink.js: the logo block, outlined
 * articulated limbs, white eyes, cheeks, shade and shine. No ground shadow. */
const NS = "http://www.w3.org/2000/svg";
export const colors = Object.freeze({
  ink: "#0c0e0d",
  green: "#3ddc97",
  greenDark: "#1f9e68",
  shade: "#2cc283",
  bone: "#f5f5f4",
  cheek: "#ff8fb1",
});
function el(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  parent?.append(node);
  return node;
}
function joint(parent, x = 0, y = 0) {
  const node = el("g", {}, parent);
  return {
    node,
    apply({ r = 0, sx = 1, sy = 1, dx = 0, dy = 0 } = {}) {
      node.setAttribute(
        "transform",
        `translate(${x + dx},${y + dy}) rotate(${r}) scale(${sx},${sy})`,
      );
    },
  };
}
function limb(parent, a, b, hand) {
  for (const [width, stroke] of [
    [34, colors.ink],
    [18, colors.greenDark],
  ])
    el(
      "line",
      {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: a,
        stroke,
        "stroke-width": width,
        "stroke-linecap": "round",
      },
      parent,
    );
  const lower = joint(parent, 0, a);
  for (const [width, stroke] of [
    [34, colors.ink],
    [18, colors.greenDark],
  ])
    el(
      "line",
      {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: b,
        stroke,
        "stroke-width": width,
        "stroke-linecap": "round",
      },
      lower.node,
    );
  if (hand)
    el(
      "circle",
      {
        cx: 0,
        cy: b + 6,
        r: 24,
        fill: colors.bone,
        stroke: colors.ink,
        "stroke-width": 8,
      },
      lower.node,
    );
  return lower;
}
export function createRig(host) {
  const svg = el(
    "svg",
    { viewBox: "-200 -420 400 440", role: "img", "aria-label": "Blink" },
    host,
  );
  const root = joint(svg);
  const legs = {},
    arms = {};
  for (const [side, x] of [
    ["L", -52],
    ["R", 52],
  ]) {
    const hip = joint(root.node, x, -78),
      knee = limb(hip.node, 40, 30, false);
    el(
      "rect",
      { x: -34, y: 22, width: 68, height: 30, rx: 15, fill: colors.ink },
      knee.node,
    );
    legs[side] = { hip, knee };
  }
  function arm(side) {
    const shoulder = joint(root.node, side === "L" ? -112 : 112, -232);
    arms[side] = { shoulder, elbow: limb(shoulder.node, 74, 62, true) };
  }
  arm("L");
  const body = el(
    "rect",
    {
      x: -120,
      y: -356,
      width: 240,
      height: 280,
      rx: 22,
      fill: colors.green,
      stroke: colors.ink,
      "stroke-width": 10,
    },
    root.node,
  );
  el(
    "path",
    {
      d: "M -115 -116 H 115 V -98 Q 115 -81 98 -81 H -98 Q -115 -81 -115 -98 Z",
      fill: colors.shade,
    },
    root.node,
  );
  el(
    "rect",
    { x: -96, y: -334, width: 54, height: 16, rx: 8, fill: "#8ff0c4" },
    root.node,
  );
  const face = joint(root.node, 0, -248),
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
    el(
      "ellipse",
      {
        cx: x * 1.72,
        cy: 52,
        rx: 19,
        ry: 10,
        fill: colors.cheek,
        opacity: 0.75,
      },
      face.node,
    );
  }
  // Pupils must paint over both white eye shapes, including during a blink.
  eyes.node.append(pupils.node);
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
  const mouth = el(
    "path",
    {
      d: "M -26 48 Q 0 44 26 48 Q 24 88 0 90 Q -24 88 -26 48 Z",
      fill: colors.ink,
      opacity: 0,
    },
    face.node,
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
  const brows = el(
    "path",
    {
      d: "M -78 -46 L -28 -34 M 28 -34 L 78 -46",
      fill: "none",
      stroke: colors.ink,
      "stroke-width": 8,
      "stroke-linecap": "round",
      opacity: 0,
    },
    face.node,
  );
  const thoughts = [-78, -52, -26].map((x) =>
    el(
      "circle",
      {
        cx: x,
        cy: -64,
        r: 6,
        fill: colors.ink,
        opacity: 0,
      },
      face.node,
    ),
  );
  const status = el(
    "circle",
    {
      cx: 0,
      cy: -344,
      r: 10,
      fill: "#d99729",
      stroke: colors.bone,
      "stroke-width": 3,
      "aria-label": "連線狀態",
    },
    root.node,
  );
  return {
    svg,
    root,
    legs,
    arms,
    body,
    face,
    eyes,
    pupils,
    smile,
    mouth,
    brows,
    thoughts,
    status,
  };
}
