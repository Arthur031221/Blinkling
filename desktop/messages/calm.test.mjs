import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createCalm } from "./calm.mjs";
import { timing } from "../shared/motion.mjs";

/** A clock the test advances by hand; timers run in due order. */
function clock() {
  let time = 0,
    next = 0;
  const pending = new Map();
  return {
    now: () => time,
    setTimer(run, ms) {
      const id = next++;
      pending.set(id, { at: time + ms, run });
      return () => pending.delete(id);
    },
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const due = [...pending]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        time = due[1].at;
        due[1].run();
      }
      time = end;
    },
    get timers() {
      return pending.size;
    },
  };
}
function harness(options) {
  const fake = clock();
  const calm = createCalm({
    now: fake.now,
    setTimer: fake.setTimer,
    ...options,
  });
  const events = [];
  calm.on("fade", (e) => events.push(["fade", e.turnId]));
  calm.on("revive", (e) => events.push(["revive", e.turnId]));
  return { fake, calm, events };
}

test("the shared settle time is 8 seconds", () => {
  assert.equal(timing.settle, 8000);
});

test("an answer fades 8 s after it settled, not before", () => {
  const { fake, calm, events } = harness();
  calm.settle("t1");
  fake.advance(7999);
  assert.deepEqual(events, []);
  fake.advance(1);
  assert.deepEqual(events, [["fade", "t1"]]);
});

test("a newer settled turn restarts the single timer", () => {
  const { fake, calm, events } = harness();
  calm.settle("t1");
  fake.advance(5000);
  calm.settle("t2");
  assert.equal(fake.timers, 1);
  fake.advance(5000);
  assert.deepEqual(events, []);
  fake.advance(3000);
  assert.deepEqual(events, [["fade", "t2"]]);
});

test("hover revives the last answer only, then it fades again after 8 s", () => {
  const { fake, calm, events } = harness();
  calm.settle("t1");
  calm.settle("t2");
  fake.advance(8000);
  calm.hover();
  assert.deepEqual(events, [
    ["fade", "t2"],
    ["revive", "t2"],
  ]);
  fake.advance(7999);
  assert.equal(events.length, 2);
  fake.advance(1);
  assert.deepEqual(events.at(-1), ["fade", "t2"]);
});

test("hover keeps a shown answer alive instead of reviving it", () => {
  const { fake, calm, events } = harness();
  calm.settle("t1");
  fake.advance(6000);
  calm.hover();
  fake.advance(6000);
  assert.deepEqual(events, []);
  fake.advance(2000);
  assert.deepEqual(events, [["fade", "t1"]]);
});

test("pin keeps the answer, unpin starts the 8 s again", () => {
  const { fake, calm, events } = harness();
  calm.settle("t1");
  calm.pin(true);
  fake.advance(60_000);
  assert.deepEqual(events, []);
  calm.pin(false);
  fake.advance(7999);
  assert.deepEqual(events, []);
  fake.advance(1);
  assert.deepEqual(events, [["fade", "t1"]]);
});

test("pinning a faded answer brings it back", () => {
  const { fake, calm, events } = harness();
  calm.settle("t1");
  fake.advance(8000);
  calm.pin(true);
  assert.deepEqual(events, [
    ["fade", "t1"],
    ["revive", "t1"],
  ]);
  fake.advance(60_000);
  assert.equal(events.length, 2);
});

test("holding the deck pauses the timer", () => {
  const { fake, calm, events } = harness();
  calm.settle("t1");
  calm.hold(true);
  fake.advance(30_000);
  assert.deepEqual(events, []);
  calm.hold(false);
  fake.advance(8000);
  assert.deepEqual(events, [["fade", "t1"]]);
});

test("a fresh calm has nothing to restore after a restart", () => {
  const { fake, calm, events } = harness();
  calm.hover();
  calm.pin(true);
  calm.pin(false);
  fake.advance(60_000);
  assert.deepEqual(events, []);
  assert.equal(fake.timers, 0);
});

test("leaving the display fades at once and hover elsewhere shows nothing", () => {
  const { fake, calm, events } = harness();
  calm.settle("t1");
  fake.advance(2000);
  calm.leave();
  assert.deepEqual(events, [["fade", "t1"]]);
  calm.hover();
  calm.pin(true);
  assert.equal(events.length, 1);
  assert.equal(fake.timers, 0);
  calm.pin(false);
  calm.settle("t2");
  fake.advance(8000);
  calm.hover();
  assert.deepEqual(events.slice(1), [
    ["fade", "t2"],
    ["revive", "t2"],
  ]);
});

test("an early timer cannot shorten the readable time", () => {
  let time = 0;
  const callbacks = [];
  const calm = createCalm({
    now: () => time,
    setTimer: (run) => {
      callbacks.push(run);
      return () => {};
    },
  });
  const events = [];
  calm.on("fade", () => events.push("fade"));
  calm.settle("t1");
  time = 3000;
  callbacks[0]();
  assert.deepEqual(events, []);
  time = 8000;
  callbacks.at(-1)();
  assert.deepEqual(events, ["fade"]);
});

test("the deck modules load in a renderer: no node: imports", () => {
  const directory = new URL(".", import.meta.url);
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".mjs") || name.endsWith(".test.mjs")) continue;
    const source = readFileSync(new URL(name, directory), "utf8");
    assert.doesNotMatch(source, /from\s+["']node:/, name);
  }
});

test("turnId and faded follow the timer instead of freezing at their first value", () => {
  const c = clock();
  const calm = createCalm({ now: c.now, setTimer: c.setTimer });
  assert.equal(calm.turnId, undefined);
  calm.settle("t1");
  assert.equal(calm.turnId, "t1");
  assert.equal(calm.faded, false);
  c.advance(timing.settle);
  assert.equal(calm.faded, true);
  calm.settle("t2");
  assert.equal(calm.turnId, "t2");
  assert.equal(calm.faded, false);
});
