import test from "node:test";
import assert from "node:assert/strict";
import { createPickKeys, KEYCODES } from "./keys.mjs";
import { timing } from "../shared/motion.mjs";

/** A fake clock whose timers run when the test advances it. */
function harness(options = {}) {
  let now = 0;
  const timers = new Set();
  const log = [];
  const keys = createPickKeys({
    pickKey: () => options.pickKey ?? "control",
    setTimer: (fn, ms) => {
      const timer = { at: now + ms, fn };
      timers.add(timer);
      return timer;
    },
    clearTimer: (timer) => timers.delete(timer),
    onRaise: () => log.push("raise"),
    onDrop: (reason) => log.push(`drop:${reason}`),
  });
  return {
    keys,
    log,
    advance(ms) {
      now += ms;
      for (const t of [...timers])
        if (t.at <= now) {
          timers.delete(t);
          t.fn();
        }
    },
    down: (code) => keys.handle({ type: "keydown", code }),
    up: (code) => keys.handle({ type: "keyup", code }),
  };
}

test("the hold threshold is the spec's 250 ms", () => {
  assert.equal(timing.pickHold, 250);
});

test("Ctrl alone held 250 ms raises the layer, release drops it at once", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.advance(249);
  assert.deepEqual(h.log, []);
  h.advance(1);
  assert.deepEqual(h.log, ["raise"]);
  assert.equal(h.keys.raised(), true);
  h.up(KEYCODES.ctrl);
  assert.deepEqual(h.log, ["raise", "drop:release"]);
  assert.equal(h.keys.raised(), false);
});

test("a quick tap does not raise anything", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.advance(120);
  h.up(KEYCODES.ctrl);
  h.advance(1000);
  assert.deepEqual(h.log, []);
});

test("Ctrl+C, Ctrl+V and Ctrl+Tab are untouched", () => {
  for (const other of [46, 47, 15]) {
    const h = harness();
    h.down(KEYCODES.ctrl);
    h.advance(100);
    h.down(other);
    h.advance(1000);
    assert.deepEqual(h.log, [], `key ${other}`);
    h.up(other);
    // Still holding Ctrl after the shortcut: it must not come back by itself.
    h.advance(1000);
    assert.deepEqual(h.log, [], `key ${other} held on`);
    h.up(KEYCODES.ctrl);
    // A fresh hold works again.
    h.down(KEYCODES.ctrl);
    h.advance(250);
    assert.deepEqual(h.log, ["raise"]);
  }
});

test("Ctrl pressed while another key is down is not Ctrl alone", () => {
  const h = harness();
  h.down(KEYCODES.shiftLeft);
  h.down(KEYCODES.ctrl);
  h.advance(1000);
  assert.deepEqual(h.log, []);
});

test("another key after the layer is up drops it", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.advance(250);
  h.down(46);
  assert.deepEqual(h.log, ["raise", "drop:key"]);
});

test("the first wheel tick drops the layer until Ctrl is released", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.advance(250);
  h.keys.handle({ type: "wheel" });
  assert.deepEqual(h.log, ["raise", "drop:wheel"]);
  h.advance(2000);
  assert.equal(h.keys.raised(), false);
  h.up(KEYCODES.ctrl);
  h.down(KEYCODES.ctrl);
  h.advance(250);
  assert.deepEqual(h.log, ["raise", "drop:wheel", "raise"]);
});

test("a wheel tick before the threshold cancels the pending raise", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.advance(100);
  h.keys.handle({ type: "wheel" });
  h.advance(1000);
  assert.deepEqual(h.log, []);
});

test("Esc drops the layer at once and it stays down while Ctrl is held", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.advance(250);
  h.down(KEYCODES.escape);
  assert.deepEqual(h.log, ["raise", "drop:escape"]);
  h.up(KEYCODES.escape);
  h.advance(1000);
  assert.deepEqual(h.log, ["raise", "drop:escape"]);
});

test("a click before the threshold means the user is using Ctrl+click", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.advance(100);
  h.keys.handle({ type: "mousedown" });
  h.advance(1000);
  assert.deepEqual(h.log, []);
});

test("either Ctrl key counts, and both held do not double raise", () => {
  const h = harness();
  h.down(KEYCODES.ctrlRight);
  h.advance(100);
  h.down(KEYCODES.ctrl);
  h.advance(150);
  assert.deepEqual(h.log, ["raise"]);
  h.up(KEYCODES.ctrlRight);
  assert.equal(h.keys.raised(), true);
  h.up(KEYCODES.ctrl);
  assert.deepEqual(h.log, ["raise", "drop:release"]);
});

test("auto-repeat keydowns of Ctrl do not restart the timer", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.advance(200);
  h.down(KEYCODES.ctrl);
  h.advance(50);
  assert.deepEqual(h.log, ["raise"]);
});

test("macOS pick key switches to Option from settings", () => {
  const h = harness({ pickKey: "option" });
  h.down(KEYCODES.ctrl);
  h.advance(1000);
  assert.deepEqual(h.log, [], "Control is free for other uses");
  h.up(KEYCODES.ctrl);
  h.down(KEYCODES.alt);
  h.advance(250);
  assert.deepEqual(h.log, ["raise"]);
  h.up(KEYCODES.alt);
  assert.deepEqual(h.log, ["raise", "drop:release"]);
});

test("changing the pick key while the layer is up drops it", () => {
  let key = "control";
  const log = [];
  const timers = [];
  const keys = createPickKeys({
    pickKey: () => key,
    setTimer: (fn) => (timers.push(fn), fn),
    clearTimer: () => {},
    onRaise: () => log.push("raise"),
    onDrop: (reason) => log.push(`drop:${reason}`),
  });
  keys.handle({ type: "keydown", code: KEYCODES.ctrl });
  timers.shift()();
  key = "option";
  keys.refresh();
  assert.deepEqual(log, ["raise", "drop:settings"]);
});

test("there is no Shift mode: Shift alone, held long, does nothing", () => {
  const h = harness();
  h.down(KEYCODES.shiftLeft);
  h.advance(5000);
  assert.deepEqual(h.log, []);
  assert.equal(h.keys.raised(), false);
});

test("dispose cancels a pending raise", () => {
  const h = harness();
  h.down(KEYCODES.ctrl);
  h.keys.dispose();
  h.advance(1000);
  assert.deepEqual(h.log, []);
});
