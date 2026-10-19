import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AutoWatch, LIMIT_FALLBACK_MS, explainPrompt } from "./index.mjs";
import { difference } from "./policy.mjs";
test("permission recovery resumes exactly one automatic explanation after typing stops", async () => {
  let idle = 0,
    done;
  const turns = [];
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => {
        done = f;
        return () => {};
      },
      send: async (t) => turns.push(t),
    },
    capture: {
      screen: async (_id, _signal, options) => {
        assert.equal(options.kind, "auto-explain");
        return { image: { data: "resumed pixels" } };
      },
    },
    displayId: () => "2",
    sample: async () => Buffer.alloc(32 * 18 * 4, 20),
    idleSeconds: () => idle,
  });
  try {
    await watch.resume();
    assert.equal(turns.length, 0);
    idle = 5;
    await watch.tick();
    assert.equal(turns.length, 1);
    assert.equal(turns[0].attachments[0].data, "resumed pixels");
    done({ type: "done", turnId: turns[0].id });
    await watch.tick();
    await watch.tick();
    assert.equal(turns.length, 1);
  } finally {
    watch.dispose();
  }
});
test("auto explain sends actual image through the one session, holds admission until done, and stops cleanly", async () => {
  let value = 20,
    now = 0,
    idle = 5,
    event,
    screenCalls = 0;
  const turns = [];
  const capture = {
    busy: false,
    screen: async () => {
      screenCalls++;
      return {
        image: { id: "image", mediaType: "image/png", data: "real-pixels" },
      };
    },
  };
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => {
        event = f;
        return () => (event = null);
      },
      send: async (t) => turns.push(t),
    },
    capture,
    displayId: () => "2",
    sample: async () => Buffer.alloc(32 * 18 * 4, value),
    idleSeconds: () => idle,
    now: () => now,
  });
  try {
    watch.enable();
    await watch.tick();
    value = 230;
    now = 6000;
    idle = 0;
    await watch.tick();
    assert.equal(screenCalls, 0);
    idle = 5;
    now = 12000;
    await watch.tick();
    now = 18000;
    await watch.tick();
    assert.equal(turns.length, 1);
    assert.equal(turns[0].source, "auto-explain");
    assert.equal(turns[0].attachments[0].data, "real-pixels");
    value = 30;
    now = 100000;
    await watch.tick();
    assert.equal(turns.length, 1);
    event({ type: "done", turnId: turns[0].id });
    await watch.tick();
    now = 106000;
    await watch.tick();
    assert.equal(turns.length, 2);
    watch.disable();
    assert.equal(typeof event, "function");
    await watch.tick();
    assert.equal(turns.length, 2);
  } finally {
    watch.dispose();
    assert.equal(event, null);
  }
});
test("disabling during a sample or capture never submits a late paid turn", async () => {
  let resolve,
    sends = 0;
  const watch = new AutoWatch({
    session: { subscribe: () => () => {}, send: () => sends++ },
    capture: { busy: false, screen: () => assert.fail() },
    displayId: () => "1",
    sample: () => new Promise((r) => (resolve = r)),
    idleSeconds: () => 5,
  });
  watch.enable();
  const tick = watch.tick();
  watch.disable();
  resolve(Buffer.alloc(32 * 18 * 4));
  await tick;
  assert.equal(sends, 0);
  watch.dispose();
});
test("a turn finishing while switched off releases admission on the next enable", async () => {
  let done,
    value = 20,
    now = 0;
  const turns = [];
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => {
        done = f;
        return () => (done = null);
      },
      send: async (t) => turns.push(t),
    },
    capture: { screen: async () => ({ image: { data: "image" } }) },
    displayId: () => "1",
    sample: async () => Buffer.alloc(32 * 18 * 4, value),
    idleSeconds: () => 5,
    now: () => now,
  });
  try {
    watch.enable();
    await watch.tick();
    value = 230;
    await watch.tick();
    await watch.tick();
    assert.equal(turns.length, 1);
    watch.disable();
    done({ type: "done", turnId: turns[0].id });
    watch.enable();
    await watch.tick();
    value = 20;
    now = 50000;
    await watch.tick();
    await watch.tick();
    assert.equal(turns.length, 2);
  } finally {
    watch.dispose();
    assert.equal(done, null);
  }
});

test("A-1: AutoWatch explains a navigation between two white pages within one interval plus settle", async () => {
  const pages = JSON.parse(
    readFileSync(
      new URL("./fixtures/white-pages.json", import.meta.url),
      "utf8",
    ),
  );
  let current = "article";
  const turns = [];
  const watch = new AutoWatch({
    session: { subscribe: () => () => {}, send: async (t) => turns.push(t) },
    capture: { screen: async () => ({ image: { data: "pixels" } }) },
    displayId: () => "1",
    sample: async () => Buffer.from(pages[current], "base64"),
    idleSeconds: () => 10,
  });
  try {
    watch.enable();
    await watch.tick();
    current = "listing";
    await watch.tick();
    assert.equal(turns.length, 0);
    await watch.tick();
    assert.equal(turns.length, 1);
  } finally {
    watch.dispose();
  }
});
test("A-1: a blinking caret and a ticking clock never start an explanation", async () => {
  const pages = JSON.parse(
    readFileSync(
      new URL("./fixtures/white-pages.json", import.meta.url),
      "utf8",
    ),
  );
  const noise = ["textPage", "caretMoved", "caretOff", "clockTick"];
  let n = 0;
  const turns = [];
  const watch = new AutoWatch({
    session: { subscribe: () => () => {}, send: async (t) => turns.push(t) },
    capture: { screen: async () => ({ image: { data: "pixels" } }) },
    displayId: () => "1",
    sample: async () => Buffer.from(pages[noise[n++ % noise.length]], "base64"),
    idleSeconds: () => 10,
  });
  try {
    watch.enable();
    for (let i = 0; i < 12; i++) await watch.tick();
    assert.equal(turns.length, 0);
  } finally {
    watch.dispose();
  }
});

// PV-1, PV-3, PV-4: guard, hold, and the detection budget.
import { MIN_INTERVAL_MS, DETECTION_BUDGET_MS } from "./policy.mjs";
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/white-pages.json", import.meta.url), "utf8"),
);
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};
function rig(over = {}) {
  const turns = [],
    states = [],
    samples = [],
    captures = [];
  const state = { page: "docSection1", idle: 10, now: 0, event: null };
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => {
        state.event = f;
        return () => (state.event = null);
      },
      send: async (t) => turns.push(t),
    },
    capture: {
      busy: false,
      screen: async () => {
        captures.push(state.now);
        return { image: { data: "pixels" } };
      },
      ...(over.capture ?? {}),
    },
    displayId: () => "1",
    sample: async () => {
      samples.push(state.now);
      return Buffer.from(fixtures[state.page], "base64");
    },
    idleSeconds: () => state.idle,
    now: () => state.now,
    onState: (s) => states.push(s),
    ...over.options,
  });
  return { watch, turns, states, samples, captures, state };
}
test("PV-1: a locked guard stops sampling and capturing, reports locked, and resumes when it lifts", async () => {
  let verdict = { ok: false, reason: "secure" };
  const reports = [];
  const { watch, turns, states, samples, captures, state } = rig({
    capture: {
      privacy: { allowed: () => verdict, report: (s) => reports.push(s) },
    },
  });
  try {
    watch.enable();
    for (let i = 0; i < 4; i++) {
      state.now += 3000;
      await watch.tick();
    }
    assert.equal(
      samples.length,
      0,
      "no screen pixels are even sampled while locked",
    );
    assert.equal(captures.length, 0);
    assert.equal(turns.length, 0);
    assert.deepEqual(
      states.filter((s) => s.state === "locked"),
      [{ enabled: true, state: "locked", reason: "secure" }],
    );
    assert.equal(reports.at(-1).state, "locked");
    verdict = { ok: true };
    await watch.tick();
    assert.equal(states.at(-1).state, "watching");
    assert.equal(reports.at(-1).state, "watching");
    assert.equal(samples.length, 1);
  } finally {
    watch.dispose();
  }
});
test("PV-1: a guard that lifts mid-sample cannot let the capture through", async () => {
  let calls = 0;
  const { watch, turns, captures } = rig({
    capture: {
      privacy: {
        allowed: () =>
          ++calls < 2 ? { ok: true } : { ok: false, reason: "private" },
      },
    },
  });
  try {
    watch.enable();
    await watch.tick();
    await watch.tick();
    assert.equal(captures.length, 0);
    assert.equal(turns.length, 0);
  } finally {
    watch.dispose();
  }
});
test("PV-3: pause(until) holds auto explain and resumes by itself once the time has passed", async () => {
  const { watch, turns, states, samples, state } = rig();
  try {
    watch.enable();
    await watch.tick();
    watch.pause(100_000);
    assert.deepEqual(states.at(-1), {
      enabled: true,
      state: "paused",
      until: 100_000,
    });
    state.page = "docSection2";
    for (state.now = 10_000; state.now < 100_000; state.now += 10_000)
      await watch.tick();
    assert.equal(samples.length, 1, "nothing is sampled during the hold");
    assert.equal(turns.length, 0);
    state.now = 100_000;
    await watch.tick();
    assert.equal(states.at(-1).state, "watching");
    state.now = 103_000;
    await watch.tick();
    state.now = 106_000;
    await watch.tick();
    assert.equal(turns.length, 1);
    assert.equal(watch.enabled, true);
  } finally {
    watch.dispose();
  }
});
test("PV-3: a usage-limit event from the session pauses until the reset, then auto explain returns", async () => {
  const { watch, turns, states, state } = rig();
  try {
    watch.enable();
    await watch.tick();
    state.event({ type: "usage-limit", resetAt: 50_000 });
    assert.equal(states.at(-1).state, "paused");
    assert.equal(states.at(-1).until, 50_000);
    state.page = "docSection3";
    state.now = 20_000;
    await watch.tick();
    assert.equal(turns.length, 0);
    state.now = 50_000;
    await watch.tick();
    state.now = 53_000;
    await watch.tick();
    state.now = 56_000;
    await watch.tick();
    assert.equal(turns.length, 1);
  } finally {
    watch.dispose();
  }
});
test("PV-3: a limit without a reset time pauses for the fallback, and switching off clears the hold", async () => {
  const { watch, states, state } = rig();
  try {
    watch.enable();
    state.event({ type: "usage-limit", resetAt: null });
    assert.equal(states.at(-1).until, 0 + LIMIT_FALLBACK_MS);
    watch.disable();
    watch.enable();
    assert.equal(states.at(-1).state, "watching");
    assert.equal(watch.holdUntil ?? null, null);
  } finally {
    watch.dispose();
  }
});
test("PV-3: a usage-limit event while auto explain is off changes nothing", async () => {
  const { watch, states, state } = rig();
  try {
    state.event({ type: "usage-limit", resetAt: 5000 });
    assert.equal(states.length, 0);
    assert.equal(watch.enabled, false);
  } finally {
    watch.dispose();
  }
});
test("PV-4: a scroll nudge never explains, the next section does, within the detection budget", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const turns = [];
  let page = "docSection1";
  const watch = new AutoWatch({
    session: { subscribe: () => () => {}, send: async (t) => turns.push(t) },
    capture: { screen: async () => ({ image: { data: "pixels" } }) },
    displayId: () => "1",
    sample: async () => Buffer.from(fixtures[page], "base64"),
    idleSeconds: () => 10,
    // The test steps a mocked clock, so the check runs inline, not in a worker.
    diff: { compare: async (a, b) => difference(a, b), dispose() {} },
  });
  try {
    assert.equal(watch.intervalMs, MIN_INTERVAL_MS);
    watch.enable();
    t.mock.timers.tick(MIN_INTERVAL_MS);
    await flush();
    page = "docNudge";
    for (let i = 0; i < 4; i++) {
      t.mock.timers.tick(MIN_INTERVAL_MS);
      await flush();
    }
    assert.equal(turns.length, 0);
    page = "docSection2";
    let elapsed = 0;
    while (!turns.length && elapsed < 2 * DETECTION_BUDGET_MS) {
      t.mock.timers.tick(MIN_INTERVAL_MS);
      elapsed += MIN_INTERVAL_MS;
      await flush();
    }
    assert.equal(turns.length, 1);
    assert.ok(elapsed <= DETECTION_BUDGET_MS, `explained after ${elapsed} ms`);
  } finally {
    watch.dispose();
  }
});
test("B2: the prompt asks for one or two short sentences, in the language chosen in settings", async () => {
  const { watch, turns, state } = rig();
  try {
    watch.language = () => "zh-TW";
    watch.enable();
    await watch.tick();
    state.page = "docSection2";
    await watch.tick();
    await watch.tick();
    assert.match(turns[0].text, /one or two short sentences/);
    assert.match(turns[0].text, /Never click/);
    assert.match(turns[0].text, /Write in Traditional Chinese/);
    assert.match(explainPrompt(), /Write in English/);
  } finally {
    watch.dispose();
  }
});
test("PV-1: an asynchronous guard is awaited, a pending answer is never read as allowed", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { watch, turns, samples } = rig({
    capture: { privacy: { allowed: () => gate } },
  });
  try {
    watch.enable();
    const tick = watch.tick();
    await flush();
    assert.equal(samples.length, 0);
    release({ ok: false, reason: "password-manager" });
    await tick;
    assert.equal(samples.length, 0);
    assert.equal(turns.length, 0);
  } finally {
    watch.dispose();
  }
});
test("PV-1: a guard that locks after the capture drops the pixels before they are sent", async () => {
  let calls = 0;
  const { watch, turns, captures, state } = rig({
    capture: {
      privacy: {
        allowed: () =>
          ++calls <= 7 ? { ok: true } : { ok: false, reason: "secure" },
      },
    },
  });
  try {
    watch.enable();
    await watch.tick();
    state.page = "docSection2";
    await watch.tick();
    await watch.tick();
    assert.equal(captures.length, 1, "it was captured");
    assert.equal(turns.length, 0, "but nothing left the app");
  } finally {
    watch.dispose();
  }
});

test("PV-2: auto explain samples and captures only the active display, at a low rate, and leaves no temp file behind", async (t) => {
  const { mkdtempSync, readdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const scratch = mkdtempSync(join(tmpdir(), "autowatch-scratch-"));
  const savedTmp = process.env.TMPDIR;
  process.env.TMPDIR = scratch;
  t.after(() => {
    if (savedTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmp;
    rmSync(scratch, { recursive: true, force: true });
  });
  assert.throws(
    () => new AutoWatch({ intervalMs: 500 }),
    /low rate/,
    "a sampling interval under one second is refused",
  );
  let active = "2",
    value = 20,
    now = 0;
  const sampled = [],
    captured = [],
    during = [],
    turns = [];
  let event;
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => ((event = f), () => {}),
      send: async (turn) => {
        during.push(readdirSync(scratch));
        turns.push(turn);
      },
    },
    capture: {
      screen: async (id) => (
        captured.push(id),
        { image: { id: "i", mediaType: "image/png", data: "pixels" } }
      ),
    },
    displayId: () => active,
    sample: async (id) => (sampled.push(id), Buffer.alloc(32 * 18 * 4, value)),
    idleSeconds: () => 5,
    now: () => now,
  });
  try {
    watch.enable();
    await watch.tick();
    value = 230;
    now = 6000;
    await watch.tick();
    now = 12000;
    await watch.tick();
    assert.equal(turns.length, 1, "one explanation was sent");
    event({ type: "done", turnId: turns[0].id });
    active = "3";
    value = 30;
    now = 100000;
    await watch.tick();
    now = 106000;
    await watch.tick();
    assert.deepEqual(
      [...new Set(sampled)].sort(),
      ["2", "3"],
      "only the display that was active at each tick is sampled",
    );
    assert.ok(captured.every((id) => id === "2" || id === "3"));
    assert.equal(
      captured.length,
      turns.length,
      "one capture per turn, none extra",
    );
    assert.equal(sampled.length, 5, "one sample per tick");
    assert.equal(typeof turns[0].attachments[0].data, "string");
    assert.deepEqual(
      during,
      turns.map(() => []),
      "no temp file while sending",
    );
    assert.deepEqual(
      readdirSync(scratch),
      [],
      "no temp file right after sending",
    );
  } finally {
    watch.dispose();
  }
});

test("pressing Auto explain with no Claude session says so instead of doing nothing", async () => {
  const watch = new AutoWatch({
    session: null,
    capture: { screen: async () => null },
    displayId: () => "1",
    sample: async () => new Uint8Array(4),
    idleSeconds: () => 10,
  });
  await assert.rejects(() => watch.start(), /session is starting/);
  assert.equal(watch.enabled, false);
  watch.dispose();
});
