/** The one motion system (N6.1). Durations, easings and springs live only
 * here; desktop/shared/motion.test.mjs fails on timing literals elsewhere. */
export const duration = Object.freeze({ fast: 120, base: 200, slow: 320 });

export const easing = Object.freeze({
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  enter: "cubic-bezier(0, 0, 0, 1)",
  exit: "cubic-bezier(0.3, 0, 1, 1)",
});

/** Critically damped spring frequencies: crisp for interface, soft for Blink's body. */
export const springs = Object.freeze({ crisp: 18, soft: 12 });

/** Behaviour timings the spec names, kept beside the motion tokens. */
export const timing = Object.freeze({
  pickHold: 250,
  // The interaction machine (desktop/interaction): the only place that decides when Blink retreats or a card closes.
  retreat: 1500,
  grace: 400,
  activity: 2000,
  readMin: 8000,
  readCap: 30000,
  menuRest: 300,
  thinkingFace: 100,
  settle: 8000,
  spotLap: 1800,
  // The genie into Blink's mouth: long enough to read as being sucked in, and
  // the wait that lets Blink open its mouth before the picture starts to move.
  genie: 970,
  eatLead: 400,
  // Launch: the wait that lets the window draw once before Blink steps in.
  appearLead: 600,
  sameChat: 60000,
  // Not motion: waits and polls that used to be bare numbers beside the code.
  frame: 17,
  cursorPoll: 16,
  stackingPoll: 250,
  layoutPoll: 10,
  permissionSettle: 800,
  focusProbe: 1000,
  guideResize: 2000,
  guideLayout: 3000,
  killGrace: 3000,
  checkpoint: 100,
  canaryPoll: 50,
  composerStartup: 10000,
});

/** Custom properties for renderers; inject once into :root. */
export const cssVariables = () =>
  [
    ...Object.entries(duration).map(
      ([name, ms]) => `--motion-${name}: ${ms}ms;`,
    ),
    ...Object.entries(easing).map(
      ([name, curve]) => `--ease-${name}: ${curve};`,
    ),
  ].join(" ");

/** Frame log for the end-to-end gate (N6.8). Animated surfaces call the
 * returned function once per frame with one of: peek, fan, pick-effect,
 * flight, mini-composer, pointing. */
export function frameLog(target = globalThis) {
  const log = (target.__blinklingFrames ??= []);
  return (surface, box) =>
    log.push({
      surface,
      t: performance.now(),
      box: box
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : null,
    });
}
