import { timing } from "../shared/motion.mjs";

const timer = (run, ms) => {
  const id = setTimeout(run, ms);
  id.unref?.();
  return () => clearTimeout(id);
};

/** The deck runs in a renderer, where node:events does not exist. */
function emitter() {
  const handlers = new Map();
  return {
    on(name, handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    emit(name, value) {
      for (const handler of handlers.get(name) ?? []) handler(value);
    },
    removeAllListeners: () => handlers.clear(),
  };
}

/** One timer for the answer deck (N6.6): the answer to the last finished turn
 * fades `settleMs` after it settled and nothing else counts. Hovering Blink
 * brings that last answer back, pinning or holding it keeps it, and leaving
 * the display forgets it. Nothing is persisted, so a restart starts empty.
 *
 * Emits `fade` and `revive`, both with `{ turnId }`. */
export function createCalm({
  settleMs = timing.settle,
  now = Date.now,
  setTimer = timer,
} = {}) {
  const calm = emitter();
  let turn,
    faded = false,
    pinned = false,
    held = false,
    cancel,
    armedAt = 0;
  const stop = () => {
    cancel?.();
    cancel = undefined;
  };
  const schedule = (ms) => {
    cancel = setTimer(() => {
      cancel = undefined;
      // A coalesced or early timer must not shorten the readable time.
      const left = settleMs - (now() - armedAt);
      if (left > 1) schedule(left);
      else fade();
    }, ms);
  };
  const arm = () => {
    stop();
    if (turn === undefined || faded || pinned || held) return;
    armedAt = now();
    schedule(settleMs);
  };
  const fade = () => {
    if (turn === undefined || faded) return;
    faded = true;
    stop();
    calm.emit("fade", { turnId: turn });
  };
  const revive = () => {
    faded = false;
    calm.emit("revive", { turnId: turn });
    arm();
  };
  return Object.assign(calm, {
    /** The answer to `turnId` finished; it is the one hover will bring back. */
    settle(turnId) {
      turn = turnId;
      faded = false;
      arm();
    },
    /** Pointer arrived on Blink: revive the last answer, or keep a shown one. */
    hover() {
      if (turn === undefined) return;
      if (faded) revive();
      else arm();
    },
    /** Pinned answers stay until unpinned. */
    pin(on) {
      pinned = Boolean(on);
      if (pinned && faded && turn !== undefined) revive();
      else arm();
    },
    /** The reader's pointer is on the deck: the timer waits. */
    hold(on) {
      held = Boolean(on);
      arm();
    },
    /** Blink moved to another display; its answers do not follow. */
    leave() {
      fade();
      turn = undefined;
      faded = false;
      stop();
    },
    get turnId() {
      return turn;
    },
    get faded() {
      return faded;
    },
    dispose() {
      stop();
      turn = undefined;
      calm.removeAllListeners();
    },
  });
}
