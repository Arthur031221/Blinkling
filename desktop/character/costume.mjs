// What Blink wears and does when the model or the effort changes. The outfit comes
// from the model and the performance from the effort:
//   - a model change plays that model's scene once (costume-scenes.mjs) and leaves
//     only its signature piece on (costume-pieces.mjs) while the model is chosen;
//   - an effort change plays that effort's show once (costume-shows.mjs).
// Nothing here runs at startup or when a pick lands on the value already in use,
// and with the Settings switch off none of it is asked for at all. The drawing is
// plain rig fields: `behind` goes under the body, `attach` and `faceExtra` move
// with it.
import { SCENE_FOR, scene } from "./costume-scenes.mjs";
import { SHOW_FOR, STILL as SHOW_STILL, show } from "./costume-shows.mjs";
import { PIECES, piece } from "./costume-pieces.mjs";

export const FAMILIES = PIECES;
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
export { SCENE_FOR, SHOW_FOR, piece };

/** How big the flourish at the end of a model scene is for each effort. */
const POWER = { low: 0.15, medium: 0.4, high: 0.6, xhigh: 0.8, max: 1 };

/** What to play when the pick goes from `before` to `after`, or null: no play for the
 * first pick, for the same value, or for a name that is not one of ours. */
export function costumeChange(before, after) {
  if (!before || !after) return null;
  if (!FAMILIES.includes(after.family) || !EFFORTS.includes(after.effort))
    return null;
  if (before.family !== after.family)
    return { family: after.family, effort: after.effort, what: "model" };
  if (before.effort !== after.effort)
    return { family: after.family, effort: after.effort, what: "effort" };
  return null;
}

/** How long a change plays, in seconds. */
export const playFor = (change) =>
  change?.what === "model"
    ? SCENE_FOR
    : (SHOW_FOR[change?.effort] ?? SHOW_FOR.medium);

/** A scene played to its end is a model's piece and a glad face. */
const SCENE_STILL = { eyes: "happy", mouth: "smile" };

/** The play `k` seconds in, as rig fields plus `bounds`, the boxes its props fill
 * in the drawing; null once it is over. `reduced` is one still pose that says the
 * same thing without moving. */
export function costumePlay(change, k, reduced = false) {
  if (!change || k < 0 || k > playFor(change)) return null;
  if (change.what === "model") {
    if (reduced) return { ...SCENE_STILL, ...piece(change.family), bounds: [] };
    return scene(change.family, k, POWER[change.effort] ?? POWER.medium);
  }
  if (reduced) return { ...(SHOW_STILL[change.effort] ?? {}), bounds: [] };
  return show(change.effort, k);
}

/** The piece Blink keeps on for a model, as rig fields; none for an unknown name.
 * `yaw` is how far Blink is turned (the scarf follows the body's outline) and `t`
 * the clock for the small things that bob. */
export function worn(family, { yaw = 0, t = 0, mirror = 0 } = {}) {
  const out = piece(family, { s: 1, yaw, t, mirror });
  return { behind: "", attach: "", faceExtra: "", front: "", ...out };
}
