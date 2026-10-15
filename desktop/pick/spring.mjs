/** Critically damped spring, advanced analytically so a long frame cannot
 * blow it up. `frequency` is the angular frequency from motion.mjs. */
export function stepSpring({ value, velocity }, target, frequency, dt) {
  const x = value - target;
  const e = Math.exp(-frequency * dt);
  const b = velocity + frequency * x;
  return {
    value: target + (x + b * dt) * e,
    velocity: (velocity - frequency * b * dt) * e,
  };
}

/** Within half a percent of the travel and nearly still (per second). */
export const settled = (
  { value, velocity },
  target,
  epsilon = 0.005,
  rest = 0.1,
) => Math.abs(value - target) < epsilon && Math.abs(velocity) < rest;
