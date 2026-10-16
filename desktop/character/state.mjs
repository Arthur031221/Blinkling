import { springs } from "../shared/motion.mjs";
/** Stable critically damped spring; caps dt after sleep to avoid explosive motion. */
export function spring(
  current,
  target,
  velocity,
  dt,
  frequency = springs.crisp,
) {
  const d = Math.min(dt, 0.05),
    f = 1 + 2 * d * frequency,
    oo = frequency * frequency,
    inv = 1 / (f + d * d * oo);
  return {
    value: (f * current + d * velocity + d * d * oo * target) * inv,
    velocity: (velocity + d * oo * (target - current)) * inv,
  };
}
