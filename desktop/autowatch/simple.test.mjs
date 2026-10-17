import { test } from "node:test";
import assert from "node:assert/strict";
import { AutoWatch, EXPLAIN_PROMPT } from "./index.mjs";
import { createDiff } from "./diff.mjs";
import { difference, fingerprint } from "./policy.mjs";

const flat = (value) => fingerprint(Buffer.alloc(32 * 18 * 4, value));

function rig(extra = {}) {
  const turns = [];
  const state = { value: 20, idle: 0, now: 0, done: null, screens: 0 };
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => {
        state.done = f;
        return () => {};
      },
      send: async (t) => turns.push(t),
    },
    capture: {
      screen: async (_id, _signal, options) => {
        state.screens++;
        assert.equal(options.attach, false);
        return { image: { id: `shot-${state.screens}`, data: "pixels" } };
      },
    },
    displayId: () => "1",
    sample: async () => Buffer.alloc(32 * 18 * 4, state.value),
    idleSeconds: () => state.idle,
    now: () => state.now,
    ...extra,
  });
  return { watch, turns, state };
}

test("turning it on looks at the whole screen and asks at once, without waiting for quiet", async () => {
  const { watch, turns } = rig();
  try {
    await watch.start();
    assert.equal(turns.length, 1);
    assert.equal(turns[0].source, "auto-explain");
    assert.equal(turns[0].text, EXPLAIN_PROMPT);
    assert.equal(turns[0].attachments.length, 1);
  } finally {
    watch.dispose();
  }
});

test("turning it on asks even with a draft in the card or an answer streaming, and only a guide on screen holds it", async () => {
  const { watch, turns, state } = rig({ busy: () => true, typing: () => true });
  try {
    await watch.start();
    assert.equal(turns.length, 1, "the press said yes");
    state.done({ type: "done", turnId: turns[0].id });
    state.value = 230;
    state.idle = 10;
    state.now = 60000;
    await watch.tick();
    assert.equal(turns.length, 1, "its own looks still wait for a free card");
  } finally {
    watch.dispose();
  }
  const guided = rig({ quiet: () => true });
  try {
    await guided.watch.start();
    assert.equal(
      guided.turns.length,
      0,
      "a guide on screen holds even a press",
    );
  } finally {
    guided.watch.dispose();
  }
});

test("the first ask is the baseline: an unchanged screen asks nothing, a changed one asks again after the cool-down", async () => {
  const { watch, turns, state } = rig();
  try {
    await watch.start();
    state.done({ type: "done", turnId: turns[0].id });
    state.idle = 10;
    for (const at of [3000, 6000, 9000]) {
      state.now = at;
      await watch.tick();
    }
    assert.equal(turns.length, 1, "an unchanged screen asks nothing");
    state.value = 230;
    // Seen and then seen to hold still, but the cool-down has not run out.
    for (const at of [12000, 15000]) {
      state.now = at;
      await watch.tick();
    }
    state.now = 18000;
    await watch.tick();
    assert.equal(turns.length, 2);
    state.done({ type: "done", turnId: turns[1].id });
    state.value = 120;
    for (const at of [21000, 24000, 27000, 30000]) {
      state.now = at;
      await watch.tick();
    }
    assert.equal(turns.length, 3, "a second change asks a third time");
  } finally {
    watch.dispose();
  }
});

test("a change seen at once still waits for the cool-down before it asks", async () => {
  const { watch, turns, state } = rig();
  try {
    await watch.start();
    state.done({ type: "done", turnId: turns[0].id });
    state.idle = 10;
    state.value = 230;
    for (const at of [3000, 6000, 9000]) {
      state.now = at;
      await watch.tick();
    }
    assert.equal(turns.length, 1, "seen and steady, held by the cool-down");
    state.now = 12000;
    await watch.tick();
    assert.equal(turns.length, 2);
  } finally {
    watch.dispose();
  }
});

test("the change check runs in a worker thread and agrees with the inline check", async () => {
  const diff = createDiff();
  try {
    const a = flat(20),
      b = flat(230);
    const verdict = await diff.compare(a, b);
    assert.deepEqual(verdict, difference(a, b));
    assert.equal(verdict.substantial, true);
    assert.equal((await diff.compare(a, flat(21))).substantial, false);
  } finally {
    diff.dispose();
  }
});

test("the worker is where the check happens: the main thread never calls difference for it", async () => {
  let posted = 0;
  const diff = createDiff({
    spawn: () => ({
      on(event, handler) {
        if (event === "message") this.reply = handler;
      },
      postMessage({ id }) {
        posted++;
        queueMicrotask(() => this.reply({ id, result: { substantial: true } }));
      },
      terminate() {},
    }),
  });
  const verdict = await diff.compare(flat(1), flat(1));
  assert.equal(posted, 1);
  assert.equal(verdict.substantial, true, "the worker's answer is the answer");
  diff.dispose();
});

test("a worker that cannot start, or dies, still gives an answer", async () => {
  const broken = createDiff({
    spawn: () => {
      throw new Error("no threads");
    },
  });
  assert.equal((await broken.compare(flat(20), flat(230))).substantial, true);
  let die;
  const dying = createDiff({
    spawn: () => ({
      on(event, handler) {
        if (event === "error") die = handler;
      },
      postMessage() {
        queueMicrotask(() => die(new Error("crashed")));
      },
      terminate() {},
    }),
  });
  assert.equal((await dying.compare(flat(20), flat(230))).substantial, true);
  assert.equal((await dying.compare(flat(20), flat(21))).substantial, false);
});
