import { timing } from "../shared/motion.mjs";

/** uiohook scancodes, the same on every OS. */
export const KEYCODES = Object.freeze({
  escape: 1,
  ctrl: 29,
  ctrlRight: 3613,
  shiftLeft: 42,
  shiftRight: 54,
  alt: 56,
  altRight: 3640,
});
const PICK_KEYS = Object.freeze({
  control: new Set([KEYCODES.ctrl, KEYCODES.ctrlRight]),
  option: new Set([KEYCODES.alt, KEYCODES.altRight]),
});

/** The pick key gate (N1.2, M4). Pure: feed it key, wheel and mouse events from
 * a global source and it says when the pick layer goes up and down.
 *  - the pick key alone, held for `hold` ms, raises the layer;
 *  - any other key, a click or the wheel first means the user is doing
 *    something else with the key, so nothing rises until it is released;
 *  - once raised, release, Esc, another key or the first wheel tick drop it;
 *  - a drop other than release keeps it down until the pick key is released. */
export function createPickKeys({
  pickKey = () => "control",
  hold = timing.pickHold,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onRaise = () => {},
  onDrop = () => {},
} = {}) {
  const down = new Set();
  let timer = null,
    raised = false,
    tainted = false,
    activeKey = null;
  const codes = () => PICK_KEYS[pickKey()] ?? PICK_KEYS.control;
  const pickHeld = () => [...down].some((c) => codes().has(c));
  const disarm = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const drop = (reason) => {
    disarm();
    if (!raised) return;
    raised = false;
    onDrop(reason);
  };
  const taint = (reason) => {
    disarm();
    drop(reason);
    if (pickHeld()) tainted = true;
  };
  const arm = () => {
    disarm();
    timer = setTimer(() => {
      timer = null;
      if (!pickHeld() || tainted || raised) return;
      raised = true;
      activeKey = pickKey();
      onRaise();
    }, hold);
  };
  return {
    raised: () => raised,
    handle(event) {
      const { type, code } = event;
      if (type === "keydown") {
        if (down.has(code)) return;
        const wasHeld = pickHeld();
        const pick = codes().has(code);
        down.add(code);
        if (pick) {
          if (!wasHeld) {
            tainted = [...down].some((c) => !codes().has(c));
            if (!tainted) arm();
          }
          return;
        }
        taint(code === KEYCODES.escape ? "escape" : "key");
      } else if (type === "keyup") {
        down.delete(code);
        if (!pickHeld()) {
          disarm();
          if (raised) drop("release");
          tainted = false;
        }
      } else if (type === "wheel") {
        if (pickHeld()) taint("wheel");
      } else if (type === "mousedown") {
        // A click before the threshold is the user's own Ctrl+click.
        if (pickHeld() && !raised) taint("click");
      }
    },
    /** The pick key setting changed: a raised layer for the old key goes down. */
    refresh() {
      if (raised && activeKey !== pickKey()) taint("settings");
    },
    dispose() {
      disarm();
      raised = false;
    },
  };
}
