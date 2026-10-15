/** What the pick looks like when it lands (M4). The planner turns a kind and
 * its measured bounds into hand-drawn primitives with delays and durations;
 * the renderer draws them and reveals each with a sliding mask, so the only
 * animated properties are transform and opacity (N6.3). Pure and seeded. */
import { duration } from "../shared/motion.mjs";
import { effectFor } from "./kinds.mjs";

export const MAX_EFFECT_MS = 450;
export const PAD = 6;

const WOBBLE = PAD - 3;
const LINE_STAGGER_MAX = 40;
const CORNER_LEN = 24;
const TAG = { width: 64, height: 20 };

function rng(seed) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** A slightly shaky line from a to b, in the local coordinates of its box. */
function shaky(rand, [x1, y1], [x2, y2], amp) {
  const j = () => (rand() * 2 - 1) * amp;
  const dx = x2 - x1;
  const dy = y2 - y1;
  return `M${r1(x1 + j())} ${r1(y1 + j())} C${r1(x1 + dx / 3 + j())} ${r1(y1 + dy / 3 + j())} ${r1(x1 + (2 * dx) / 3 + j())} ${r1(y1 + (2 * dy) / 3 + j())} ${r1(x2 + j())} ${r1(y2 + j())}`;
}

const inside = (box, bounds) => {
  const x = clamp(box.x, bounds.x - PAD, bounds.x + bounds.width + PAD);
  const y = clamp(box.y, bounds.y - PAD, bounds.y + bounds.height + PAD);
  return {
    x,
    y,
    width: Math.min(box.width, bounds.x + bounds.width + PAD - x),
    height: Math.min(box.height, bounds.y + bounds.height + PAD - y),
  };
};

/** Four sides drawn one after another around the bounds, as one closing loop. */
function loop(bounds, rand, start) {
  const { x, y, width: w, height: h } = bounds;
  const step = Math.round(duration.fast * 0.6);
  const side = (i, box, from, to, reveal) => ({
    role: "stroke",
    reveal,
    d: shaky(rand, from, to, WOBBLE),
    width: 3,
    box,
    delay: start + i * step,
    duration: duration.fast,
  });
  const horizontal = (top) => ({
    x: x - PAD,
    y: top ? y - PAD : y + h - PAD,
    width: w + 2 * PAD,
    height: 2 * PAD,
  });
  const vertical = (left) => ({
    x: left ? x - PAD : x + w - PAD,
    y: y - PAD,
    width: 2 * PAD,
    height: h + 2 * PAD,
  });
  return [
    side(0, horizontal(true), [0, PAD], [w + 2 * PAD, PAD], "left"),
    side(1, vertical(false), [PAD, 0], [PAD, h + 2 * PAD], "top"),
    side(2, horizontal(false), [w + 2 * PAD, PAD], [0, PAD], "right"),
    side(3, vertical(true), [PAD, h + 2 * PAD], [PAD, 0], "bottom"),
  ];
}

function corners(bounds, rand) {
  const { x, y, width: w, height: h } = bounds;
  const l = Math.min(CORNER_LEN, w / 3, h / 3);
  // An L whose corner sits on the picked corner; dx/dy point into the box.
  const at = (cx, cy, dx, dy, i) => {
    const px = dx > 0 ? 0 : l;
    const py = dy > 0 ? 0 : l;
    return {
      role: "corner",
      reveal: dx > 0 ? "left" : "right",
      d: `M${px} ${py + dy * l} L${px} ${py} L${px + dx * l} ${py}`,
      width: 3,
      box: { x: cx - px, y: cy - py, width: l, height: l },
      delay: i * Math.round(duration.fast * 0.25),
      duration: duration.fast,
    };
  };
  return [
    at(x, y, 1, 1, 0),
    at(x + w, y, -1, 1, 1),
    at(x + w, y + h, -1, -1, 2),
    at(x, y + h, 1, -1, 3),
  ];
}

function plan(kind, bounds, lines, rand) {
  const { x, y, width: w, height: h } = bounds;
  switch (effectFor(kind)) {
    case "crayon-lines": {
      const rects = lines.length ? lines : [bounds];
      const n = rects.length;
      const gap =
        n > 1
          ? Math.min(
              LINE_STAGGER_MAX,
              (MAX_EFFECT_MS - duration.base) / (n - 1),
            )
          : 0;
      return rects.map((line, i) => {
        const box = inside(line, bounds);
        const thick = clamp(box.height * 0.85, 4, 28);
        return {
          role: "stroke",
          reveal: "left",
          d: shaky(
            rand,
            [0, box.height / 2],
            [box.width, box.height / 2],
            Math.min(2, box.height / 6),
          ),
          width: r1(thick),
          box,
          delay: Math.round(i * gap),
          duration: duration.base,
        };
      });
    }
    case "loop":
    case "window-edge":
    case "outline":
      return loop(bounds, rand, 0);
    case "outline-sweep":
      return [
        ...loop(bounds, rand, 0),
        {
          role: "sweep",
          reveal: "top",
          d: "",
          width: 0,
          box: { x, y, width: w, height: h },
          delay: Math.round(duration.fast * 0.6),
          duration: duration.base,
        },
      ];
    case "brackets-sides": {
      const box = (left) => ({
        x: left ? x - PAD : x + w - 2 * PAD,
        y: y - PAD,
        width: 3 * PAD,
        height: h + 2 * PAD,
      });
      const bracket = (left, delay) => {
        const H = h + 2 * PAD;
        const tip = left ? 3 * PAD - 1 : 1;
        const spine = left ? PAD : 2 * PAD;
        return {
          role: "stroke",
          reveal: "top",
          d: `${shaky(rand, [tip, 0], [spine, 0], 1)} L${spine} ${H} L${tip} ${H}`,
          width: 3,
          box: box(left),
          delay,
          duration: duration.base,
        };
      };
      return [
        bracket(true, 0),
        bracket(false, Math.round(duration.fast * 0.5)),
      ];
    }
    case "wavy-underline": {
      const box = {
        x: x - PAD,
        y: y + h - PAD,
        width: w + 2 * PAD,
        height: 2 * PAD,
      };
      return [
        {
          role: "stroke",
          reveal: "left",
          d: shaky(rand, [0, PAD], [box.width, PAD], WOBBLE),
          width: 3,
          box,
          delay: 0,
          duration: duration.base,
        },
      ];
    }
    case "circle": {
      const box = {
        x: x - PAD,
        y: y - PAD,
        width: w + 2 * PAD,
        height: h + 2 * PAD,
      };
      const rx = box.width / 2 - 1;
      const ry = box.height / 2 - 1;
      const cx = box.width / 2;
      const cy = box.height / 2;
      const j = () => (rand() * 2 - 1) * 1.5;
      return [
        {
          role: "stroke",
          reveal: "left",
          d: `M${r1(cx - rx)} ${r1(cy + j())} A${r1(rx)} ${r1(ry)} 0 1 1 ${r1(cx + rx)} ${r1(cy + j())} A${r1(rx)} ${r1(ry)} 0 1 1 ${r1(cx - rx + 3)} ${r1(cy - 3)}`,
          width: 3,
          box,
          delay: 0,
          duration: duration.base,
        },
      ];
    }
    case "bracket-left": {
      const box = {
        x: x - PAD,
        y: y - PAD,
        width: 3 * PAD,
        height: h + 2 * PAD,
      };
      return [
        {
          role: "stroke",
          reveal: "top",
          d: `${shaky(rand, [3 * PAD - 1, 0], [PAD, 0], 1)} L${PAD} ${box.height} L${3 * PAD - 1} ${box.height}`,
          width: 3,
          box,
          delay: 0,
          duration: duration.base,
        },
      ];
    }
    case "corner-brackets-tag": {
      const tag = {
        role: "tag",
        reveal: "fade",
        d: "",
        width: 0,
        box: {
          x,
          y,
          width: Math.min(TAG.width, w),
          height: Math.min(TAG.height, h),
        },
        delay: Math.round(duration.fast * 0.5),
        duration: duration.fast,
      };
      return [...corners(bounds, rand), tag];
    }
    case "corner-brackets":
    default:
      return corners(bounds, rand);
  }
}

export function planEffect({
  kind,
  bounds,
  lines = [],
  seed = 0,
  reducedMotion = false,
}) {
  const effect = effectFor(kind);
  if (reducedMotion) {
    const { width: w, height: h } = bounds;
    return {
      effect,
      primitives: [
        {
          role: "stroke",
          reveal: "fade",
          d: `M1 1 L${w - 1} 1 L${w - 1} ${h - 1} L1 ${h - 1} Z`,
          width: 2,
          box: { ...bounds },
          delay: 0,
          duration: duration.fast,
        },
      ],
      total: duration.fast,
    };
  }
  const primitives = plan(kind, bounds, lines, rng(seed));
  return {
    effect,
    primitives,
    total: Math.max(...primitives.map((p) => p.delay + p.duration)),
  };
}
