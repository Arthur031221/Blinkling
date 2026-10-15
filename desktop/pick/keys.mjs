import { timing } from "../shared/motion.mjs";

/** Pick-key state machine (M4, N1.2). Pure: the key source feeds normalized
 * events, the host supplies timers. Holding the pick key alone for the
 * threshold raises the layer. Any other key, a wheel tick, Esc or releasing
 * the key drops it, so every ordinary shortcut and Ctrl+wheel zoom is left
 * alone. Shift has no meaning here (N3.1): it is just another key.
 *
 * Events: { type: "keydown" | "keyup", key, code } with key one of "control",
 * "option", "escape", "shift" or any other name; { type: "wheel" };
 * { type: "mousemove" | "mousedown" | "mouseup", x, y }. */
export function createPickKeys({
  key = "control",
  threshold = timing.pickHold,
  setTimeout: later = globalThis.setTimeout,
  clearTimeout: cancel = globalThis.clearTimeout,
  onRaise = () => {},
  onDrop = () => {},
} = {}) {
  let pickKey = key;
  const held = new Set();
  // Other keys currently down: a pick key pressed while one is held is a shortcut.
  const others = new Set();
  let timer = null;
  let raised = false;
  // Set by another key or a wheel tick: nothing raises until the pick key is released.
  let latched = false;
  let pointer = null;

  const stopTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const drop = (why) => {
    stopTimer();
    if (!raised) return;
    raised = false;
    onDrop(why);
  };
  const latch = (why) => {
    latched = true;
    drop(why);
    stopTimer();
  };
  const reset = () => {
    held.clear();
    others.clear();
    latched = false;
    stopTimer();
  };

  function feed(event) {
    switch (event.type) {
      case "mousemove":
      case "mousedown":
      case "mouseup":
        pointer = { x: event.x, y: event.y };
        return;
      case "wheel":
        if (held.size) latch("wheel");
        return;
      case "keydown": {
        if (event.key === pickKey) {
          const first = held.size === 0;
          held.add(event.code ?? event.key);
          if (first && others.size) latched = true;
          if (first && !latched && !raised && timer === null)
            timer = later(() => {
              timer = null;
              raised = true;
              onRaise();
            }, threshold);
          return;
        }
        others.add(event.code ?? event.key);
        if (held.size) latch(event.key === "escape" ? "escape" : "key");
        return;
      }
      case "keyup": {
        if (event.key !== pickKey) {
          others.delete(event.code ?? event.key);
          return;
        }
        held.delete(event.code ?? event.key);
        if (held.size) return;
        latched = false;
        drop("release");
        stopTimer();
      }
    }
  }
  return {
    feed,
    get raised() {
      return raised;
    },
    get pointer() {
      return pointer;
    },
    get key() {
      return pickKey;
    },
    setKey(next) {
      if (next === pickKey) return;
      pickKey = next;
      drop("setting");
      reset();
    },
    dispose() {
      drop("dispose");
      reset();
    },
  };
}
