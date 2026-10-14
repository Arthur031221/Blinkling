import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { GuideController } from "./guide.mjs";
import { collectTurn } from "./turn.mjs";
const guide = {
  purpose: "Report overview.",
  sections: [
    {
      id: "a",
      label: "Results",
      description: "The main results.",
      paragraphs: ["Sales grew."],
      rect: { x: 10, y: 10, width: 100, height: 80 },
    },
  ],
  steps: [
    { id: "one", note: "Read the results.", regionIds: ["a"], arrows: [] },
    { id: "two", note: "Compare them.", regionIds: ["a"], arrows: [] },
  ],
};
const capture = {
  display: {
    id: "1",
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    scaleFactor: 1,
  },
  region: { x: 0, y: 0, width: 800, height: 600 },
  pixelWidth: 800,
  pixelHeight: 600,
  image: { data: "pixels" },
};
test("guide sends image, validates complete content and renders Next/Back/overview as bubbles", async () => {
  const events = [],
    overlay = new EventEmitter();
  let listener, turn, shown;
  overlay.show = async (c, d) => (shown = { c, d });
  overlay.step = (i) => events.push({ step: i });
  overlay.dismiss = () => {};
  const session = {
    subscribe: (f) => {
      listener = f;
      return () => (listener = null);
    },
    send: async (t) => {
      turn = t;
      listener({ type: "delta", text: JSON.stringify(guide) });
      listener({ type: "done", turnId: "unrelated" });
      listener({ type: "done", turnId: t.id });
    },
    stop: async () => {},
  };
  const controller = new GuideController({
    session,
    overlay,
    capture: { run: async () => capture },
    onGuide: (e) => events.push(e),
  });
  await controller.start("1");
  assert.equal(turn.source, "guide");
  assert.equal(turn.attachments[0].data, "pixels");
  assert.match(turn.text, /EVERY main section/);
  assert.equal(shown.d[0].rect.width, 100);
  assert.deepEqual(events.at(-1).bubbles, [
    "Report overview.",
    "Results：The main results.",
    "Sales grew.",
  ]);
  controller.next();
  assert.equal(events.at(-1).index, 0);
  controller.next();
  assert.equal(events.at(-1).index, 1);
  controller.back();
  assert.equal(events.at(-1).index, 0);
  controller.overview();
  assert.equal(events.at(-1).index, -1);
  overlay.emit("dismissed", "content-changed");
  assert.equal(controller.guide, null);
  controller.dispose();
});
test("malformed model output never becomes drawings", async () => {
  const overlay = new EventEmitter();
  overlay.show = () => assert.fail();
  overlay.dismiss = () => {};
  let listener;
  const controller = new GuideController({
    session: {
      subscribe: (f) => {
        listener = f;
        return () => {};
      },
      send: async (t) => {
        listener({ type: "delta", text: "not JSON" });
        listener({ type: "done", turnId: t.id });
      },
    },
    overlay,
    capture: { run: async () => capture },
  });
  await assert.rejects(controller.start("1"));
  controller.dispose();
});
test("cancellation interrupts only the pending turn and releases the subscription", async () => {
  let unsubscribed = 0,
    stopped = 0;
  const abort = new AbortController();
  const pending = collectTurn(
    {
      subscribe: () => () => unsubscribed++,
      send: async () => {},
      stop: async () => stopped++,
    },
    { id: "turn" },
    { signal: abort.signal },
  );
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(unsubscribed, 1);
  assert.equal(stopped, 1);
});
function rig(replies, options = {}) {
  const events = [],
    overlay = new EventEmitter(),
    turns = [],
    steps = [],
    shown = [];
  let listener;
  overlay.show = async (c, d) => shown.push({ c, d });
  overlay.step = (i) => steps.push(i);
  overlay.dismiss = () => {};
  const session = {
    subscribe: (f) => {
      listener = f;
      return () => (listener = null);
    },
    send: async (t) => {
      turns.push(t);
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      listener({ type: "delta", text: reply });
      listener({ type: "done", turnId: t.id });
    },
    stop: async () => {},
  };
  const captures = [];
  const controller = new GuideController({
    session,
    overlay,
    capture: {
      run: async (...args) => {
        captures.push(args);
        return capture;
      },
    },
    onGuide: (e) => events.push(e),
    ...options,
  });
  return { controller, events, turns, steps, shown, captures };
}
const threeSteps = () => ({
  ...guide,
  steps: ["one", "two", "three"].map((id) => ({
    id,
    note: `Step ${id}.`,
    regionIds: ["a"],
    arrows: [],
  })),
});
test("the last step is drawn and finishing shows a closing bubble from Blink", async () => {
  const r = rig([JSON.stringify(threeSteps())]);
  await r.controller.start("1");
  r.controller.next();
  r.controller.next();
  r.controller.next();
  assert.deepEqual(
    r.steps.slice(-3),
    [0, 1, 2],
    "all three steps drawn, the last too",
  );
  assert.equal(r.events.at(-1).index, 2);
  assert.equal(
    r.events.at(-1).canNext,
    true,
    "Next on the last step finishes the tour",
  );
  assert.equal(r.events.at(-1).last, true);
  r.controller.next();
  const done = r.events.at(-1);
  assert.equal(done.phase, "finished");
  assert.equal(done.bubbles.length, 1);
  assert.match(done.bubbles[0], /導覽/);
  assert.equal(done.canBack, true);
  assert.equal(done.canNext, false);
  assert.equal(r.steps.at(-1), -1, "everything is outlined again at the end");
  // Back leaves the closing bubble for the last step; Next after it finishes again.
  r.controller.back();
  assert.equal(r.events.at(-1).phase, "step");
  assert.equal(r.events.at(-1).index, 2);
  r.controller.next();
  assert.equal(r.events.at(-1).phase, "finished");
  r.controller.next();
  assert.equal(r.events.at(-1).phase, "finished", "no step beyond the end");
  r.controller.dispose();
});
test("Next, Back, overview and end work across every step", async () => {
  const r = rig([JSON.stringify(threeSteps())]);
  await r.controller.start("1");
  const seq = [];
  const note = () =>
    seq.push(`${r.events.at(-1).phase}:${r.events.at(-1).index}`);
  r.controller.back(); // no step before the overview
  note();
  r.controller.next();
  note();
  r.controller.next();
  note();
  r.controller.back();
  note();
  r.controller.overview();
  note();
  r.controller.next();
  note();
  r.controller.next();
  note();
  r.controller.next();
  note();
  r.controller.next();
  note();
  assert.deepEqual(seq, [
    "overview:-1",
    "step:0",
    "step:1",
    "step:0",
    "overview:-1",
    "step:0",
    "step:1",
    "step:2",
    "finished:3",
  ]);
  r.controller.dismiss();
  assert.equal(r.controller.guide, null);
  const count = r.events.length;
  r.controller.next();
  r.controller.back();
  assert.equal(
    r.events.length,
    count,
    "nothing to step through after 結束導覽",
  );
});
test("a reply with prose around the JSON or one bad region still draws the valid part", async () => {
  const bad = threeSteps();
  bad.sections.push({
    id: "broken",
    label: "Broken",
    rect: { x: -50, y: 0, width: 0, height: 0 },
  });
  const r = rig([`好的！\n${JSON.stringify(bad)}\n以上。`]);
  await r.controller.start("1");
  assert.equal(r.shown.length, 1);
  assert.equal(r.shown[0].d.length, 1);
  assert.equal(r.events.at(-1).phase, "overview");
});
test("a failed turn shows a plain error bubble with a retry that reruns the guide", async () => {
  const r = rig([new Error("network down"), JSON.stringify(guide)]);
  await assert.rejects(r.controller.start("1"), /network down/);
  const failed = r.events.at(-1);
  assert.equal(failed.phase, "error");
  assert.deepEqual(failed.bubbles, ["導覽暫時無法完成，請再試一次。"]);
  assert.equal(failed.retry, true);
  assert.equal(failed.message, "導覽暫時無法完成，請再試一次。");
  await r.controller.retry();
  assert.equal(r.turns.length, 2, "retry reran the guide turn");
  assert.deepEqual(
    r.captures.map((c) => c[1]),
    ["1", "1"],
    "and captured the same display again",
  );
  assert.equal(r.events.at(-1).phase, "overview");
  r.controller.dispose();
});
test("a reply with no usable step, or a missing session, fails with the same error bubble", async () => {
  for (const reply of [
    "我看不到畫面",
    JSON.stringify({ ...guide, steps: [] }),
  ]) {
    const r = rig([reply]);
    await assert.rejects(r.controller.start("1"));
    assert.equal(r.events.at(-1).phase, "error");
    assert.equal(r.events.at(-1).retry, true);
    assert.equal(r.shown.length, 0);
  }
  const r = rig([], { session: null });
  await assert.rejects(r.controller.start("1"));
  assert.equal(r.events.at(-1).phase, "error");
});
test("retry does nothing before any guide was requested", async () => {
  const r = rig([]);
  await r.controller.retry();
  assert.equal(r.turns.length, 0);
});
test("the prompt pins the reply language to the user's", async () => {
  const r = rig([JSON.stringify(guide)], { language: () => "zh-TW" });
  await r.controller.start("1");
  assert.match(r.turns[0].text, /Traditional Chinese/);
});
