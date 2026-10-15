import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createPickKeys } from "./keys.mjs";
import { timing } from "../shared/motion.mjs";

/** A fake clock: timers run when the test advances time. */
function clock() {
  let now = 0;
  const timers = new Map();
  let next = 1;
  return {
    setTimeout(fn, ms) {
      timers.set(next, { fn, at: now + ms });
      return next++;
    },
    clearTimeout: (id) => timers.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end);
        if (!due.length) break;
        due.sort((a, b) => a[1].at - b[1].at);
        const [id, t] = due[0];
        timers.delete(id);
        now = t.at;
        t.fn();
      }
      now = end;
    },
  };
}
function rig(options = {}) {
  const c = clock();
  const log = [];
  const keys = createPickKeys({
    setTimeout: c.setTimeout,
    clearTimeout: c.clearTimeout,
    onRaise: () => log.push("raise"),
    onDrop: (why) => log.push(`drop:${why}`),
    ...options,
  });
  const down = (key, code = key) => keys.feed({ type: "keydown", key, code });
  const up = (key, code = key) => keys.feed({ type: "keyup", key, code });
  return { c, log, keys, down, up };
}

test("Ctrl alone held for the threshold raises the layer", () => {
  const { c, log, down } = rig();
  down("control");
  c.advance(timing.pickHold - 1);
  assert.deepEqual(log, []);
  c.advance(1);
  assert.deepEqual(log, ["raise"]);
});

test("the threshold is the spec's 250 ms", () => {
  assert.equal(timing.pickHold, 250);
});

test("a quick tap never raises and leaves no timer behind", () => {
  const { c, log, down, up } = rig();
  down("control");
  c.advance(100);
  up("control");
  c.advance(1000);
  assert.deepEqual(log, []);
});

test("key repeat while Ctrl is held does not restart the threshold", () => {
  const { c, log, down } = rig();
  down("control");
  c.advance(200);
  down("control");
  c.advance(50);
  assert.deepEqual(log, ["raise"]);
});

for (const other of ["c", "v", "tab", "shift", "a", "meta"]) {
  test(`Ctrl+${other} is untouched: another key cancels the pick`, () => {
    const { c, log, down, up } = rig();
    down("control");
    c.advance(100);
    down(other);
    c.advance(1000);
    assert.deepEqual(log, [], "never raised");
    up(other);
    c.advance(1000);
    assert.deepEqual(log, [], "still latched while Ctrl is held");
    up("control");
    down("control");
    c.advance(timing.pickHold);
    assert.deepEqual(log, ["raise"], "a fresh press works again");
  });
}

test("a key pressed before Ctrl keeps Ctrl from raising", () => {
  const { c, log, down, up } = rig();
  down("a");
  down("control");
  c.advance(1000);
  assert.deepEqual(log, []);
  up("control");
  up("a");
  down("control");
  c.advance(timing.pickHold);
  assert.deepEqual(log, ["raise"]);
});

test("another key while the layer is up drops it", () => {
  const { c, log, down } = rig();
  down("control");
  c.advance(timing.pickHold);
  down("c");
  assert.deepEqual(log, ["raise", "drop:key"]);
});

test("releasing Ctrl drops the layer at once", () => {
  const { c, log, down, up } = rig();
  down("control");
  c.advance(timing.pickHold);
  up("control");
  assert.deepEqual(log, ["raise", "drop:release"]);
});

test("Esc drops the layer at once and does not raise again until released", () => {
  const { c, log, down, up } = rig();
  down("control");
  c.advance(timing.pickHold);
  down("escape");
  assert.deepEqual(log, ["raise", "drop:escape"]);
  up("escape");
  c.advance(1000);
  assert.deepEqual(log, ["raise", "drop:escape"]);
});

test("the first wheel tick drops the layer until Ctrl is released", () => {
  const { c, log, keys, down, up } = rig();
  down("control");
  c.advance(timing.pickHold);
  keys.feed({ type: "wheel" });
  assert.deepEqual(log, ["raise", "drop:wheel"]);
  keys.feed({ type: "wheel" });
  c.advance(5000);
  assert.deepEqual(log, ["raise", "drop:wheel"], "no second drop, no re-raise");
  up("control");
  down("control");
  c.advance(timing.pickHold);
  assert.deepEqual(log, ["raise", "drop:wheel", "raise"]);
});

test("a wheel tick before the threshold cancels the pick", () => {
  const { c, log, keys, down } = rig();
  down("control");
  c.advance(100);
  keys.feed({ type: "wheel" });
  c.advance(1000);
  assert.deepEqual(log, []);
});

test("Shift alone and Shift with a drag do nothing (N3.1)", () => {
  const { c, log, keys, down, up } = rig();
  down("shift");
  c.advance(5000);
  keys.feed({ type: "mousedown", x: 1, y: 1 });
  keys.feed({ type: "mousemove", x: 90, y: 90 });
  keys.feed({ type: "mouseup", x: 90, y: 90 });
  up("shift");
  assert.deepEqual(log, []);
});

test("left and right Control count as one pick key", () => {
  const { c, log, down, up } = rig();
  down("control", "ControlLeft");
  down("control", "ControlRight");
  c.advance(timing.pickHold);
  up("control", "ControlLeft");
  assert.deepEqual(log, ["raise"], "still held through the other Control");
  up("control", "ControlRight");
  assert.deepEqual(log, ["raise", "drop:release"]);
});

test("the pick key can be switched to Option, and then Control does nothing", () => {
  const { c, log, keys, down, up } = rig({ key: "control" });
  keys.setKey("option");
  down("control");
  c.advance(1000);
  up("control");
  assert.deepEqual(log, []);
  down("option");
  c.advance(timing.pickHold);
  assert.deepEqual(log, ["raise"]);
  up("option");
  assert.deepEqual(log, ["raise", "drop:release"]);
});

test("switching the key while the layer is up drops it", () => {
  const { c, log, keys, down } = rig();
  down("control");
  c.advance(timing.pickHold);
  keys.setKey("option");
  assert.deepEqual(log, ["raise", "drop:setting"]);
});

test("dispose drops a raised layer and cancels a pending one", () => {
  const a = rig();
  a.down("control");
  a.c.advance(timing.pickHold);
  a.keys.dispose();
  assert.deepEqual(a.log, ["raise", "drop:dispose"]);
  const b = rig();
  b.down("control");
  b.keys.dispose();
  b.c.advance(1000);
  assert.deepEqual(b.log, []);
});

test("the pointer is remembered so the layer can start at the cursor", () => {
  const { keys } = rig();
  keys.feed({ type: "mousemove", x: 40, y: 50 });
  assert.deepEqual(keys.pointer, { x: 40, y: 50 });
});
