/** The picked thing flies into Blink (M5). Pure geometry: a quadratic arc in
 * global coordinates, sampled into transform/opacity keyframes only (N6.3).
 * Easing and duration come from the motion tokens at the call site. */
import { duration } from "../shared/motion.mjs";

export const FLIGHT_MS = duration.slow;

const MAX_THUMB = 160;
const END_SCALE = 0.2;
const MIN_LIFT = 60;
const LIFT_RATIO = 0.3;
const FADE_FROM = 0.8;

export function thumbSize({ width, height }) {
  const k = Math.min(1, MAX_THUMB / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}

export function flightPath(from, to) {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const distance = Math.hypot(to.x - a.x, to.y - a.y);
  const lift = Math.max(MIN_LIFT, distance * LIFT_RATIO);
  const c = { x: (a.x + to.x) / 2, y: (a.y + to.y) / 2 - lift };
  return {
    at(t) {
      const u = 1 - t;
      return {
        x: u * u * a.x + 2 * u * t * c.x + t * t * to.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * to.y,
        scale: 1 - (1 - END_SCALE) * t,
      };
    },
  };
}

export function flightKeyframes(path, steps) {
  const round = (n) => Math.round(n * 100) / 100;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const p = path.at(t);
    return {
      offset: t,
      opacity:
        t <= FADE_FROM ? 1 : round(1 - (t - FADE_FROM) / (1 - FADE_FROM)),
      transform: `translate3d(${round(p.x)}px, ${round(p.y)}px, 0) scale(${round(p.scale)})`,
    };
  });
}
