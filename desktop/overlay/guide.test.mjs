import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { GuideController, closingMessage } from "./guide.mjs";
import { STRINGS } from "./strings.mjs";
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
    { id: "one", note: "Read the results.", regionIds: ["a"] },
    { id: "two", note: "Compare them.", regionIds: ["a"] },
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
test("guide sends the image, draws numbered marks through pointing only and renders Next/Back/overview as bubbles", async () => {
  const r = rig([JSON.stringify(guide)]);
  await r.controller.start("1");
  assert.equal(r.turns[0].source, "guide");
  assert.equal(r.turns[0].attachments[0].data, "pixels");
  assert.doesNotMatch(r.turns[0].text, /concise/i);
  assert.match(r.turns[0].text, /no more than 10 steps/);
  assert.doesNotMatch(
    r.turns[0].text,
    /arrow/i,
    "no arrows: the marks say it all",
  );
  assert.equal(r.pointing.shown.length, 1);
  const { refs, options } = r.pointing.shown[0];
  assert.deepEqual(refs, [
    {
      n: 1,
      rect: { x: 10, y: 10, width: 100, height: 80 },
      label: "Results",
      kind: "frame",
    },
  ]);
  assert.equal(options.displayId, "1");
  assert.equal(options.capture, capture, "boxes are screenshot pixels");
  assert.equal(options.snap, false, "the guide's own boxes are not snapped");
  assert.equal(r.events.at(-1).phase, "step", "step 1 first");
  assert.equal(r.events.at(-1).index, 0);
  assert.equal(r.events.at(-1).total, 2, "the card says step 1 of 2");
  assert.deepEqual(r.events.at(-1).bubbles, ["Read the results."]);
  r.controller.overview();
  assert.deepEqual(r.events.at(-1).bubbles, ["Report overview."]);
  assert.deepEqual(r.events.at(-1).steps, [
    { title: "Results", note: "Read the results." },
    { title: "Results", note: "Compare them." },
  ]);
  r.controller.next();
  assert.deepEqual(
    r.events.at(-1).aim,
    { x: 60, y: 50 },
    "Blink aims at the region",
  );
  assert.equal(r.events.at(-1).title, "Results");
  assert.equal(r.events.at(-1).index, 0);
  r.controller.next();
  assert.equal(r.events.at(-1).index, 1);
  r.controller.back();
  assert.equal(r.events.at(-1).index, 0);
  r.controller.overview();
  assert.equal(r.events.at(-1).index, -1);
  r.overlay.emit("dismissed", "content-changed");
  assert.equal(r.controller.guide, null);
  r.controller.dispose();
});
test("malformed model output never becomes marks", async () => {
  const r = rig(["not JSON"]);
  await assert.rejects(r.controller.start("1"));
  assert.equal(r.pointing.shown.length, 0);
  r.controller.dispose();
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
/** Pointing and overlay stand-ins: the guide may draw only through pointing. */
function fakes() {
  const overlay = new EventEmitter(),
    pointing = { shown: [], focused: [], cleared: [] };
  pointing.show = async (refs, options) => {
    pointing.shown.push({ refs, options });
    return pointing.result ?? true;
  };
  pointing.focus = (which) => pointing.focused.push(which);
  pointing.onNav = (fn) => {
    overlay.on("nav", fn);
    return () => overlay.off("nav", fn);
  };
  pointing.clear = (reason) => {
    pointing.cleared.push(reason);
    overlay.emit("dismissed", reason);
  };
  overlay.show = () => assert.fail("the guide never draws on the overlay");
  overlay.step = () => assert.fail("the guide never steps the overlay");
  overlay.dismiss = () => assert.fail("the guide dismisses through pointing");
  return { overlay, pointing };
}
function rig(replies, options = {}) {
  const events = [],
    turns = [],
    ended = [],
    { overlay, pointing } = fakes();
  let listener;
  const session = {
    subscribe: (f) => {
      listener = f;
      return () => (listener = null);
    },
    send: async (t) => {
      turns.push(t);
      const reply = await replies.shift();
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
    pointing,
    capture: {
      run: async (...args) => {
        captures.push(args);
        return capture;
      },
    },
    onGuide: (e) => events.push(e),
    onEnd: (e) => ended.push(e),
    language: () => "zh-TW",
    ...options,
  });
  return { controller, events, turns, pointing, overlay, ended, captures };
}
const threeSteps = () => ({
  ...guide,
  steps: ["one", "two", "three"].map((id) => ({
    id,
    note: `Step ${id}.`,
    regionIds: ["a"],
  })),
});
const fixture = await readFile(
  new URL("./recorded/haiku-low-reply.txt", import.meta.url),
  "utf8",
);
const bigCapture = {
  ...capture,
  display: {
    id: "1",
    bounds: { x: 0, y: 0, width: 1280, height: 900 },
    scaleFactor: 1,
  },
  pixelWidth: 1280,
  pixelHeight: 900,
};
test("the guide succeeds on a recorded haiku reply, marks numbered like the bubbles", async () => {
  const r = rig([fixture], {
    capture: { run: async () => bigCapture },
  });
  const guide = await r.controller.start("1");
  assert.ok(guide.steps.length >= 3);
  assert.equal(r.events.at(-1).phase, "step");
  const refs = r.pointing.shown[0].refs;
  assert.equal(refs.length, guide.sections.length);
  assert.deepEqual(
    refs.map((ref) => ref.n),
    refs.map((_, i) => i + 1),
    "numbered in order, like the bubbles",
  );
  assert.deepEqual(
    refs.map((ref) => ref.label),
    guide.sections.map((s) => s.label),
  );
  r.controller.dispose();
});
test("a step focuses the marks of its regions, the overview and the end show them all", async () => {
  const two = {
    ...guide,
    sections: [
      guide.sections[0],
      { ...guide.sections[0], id: "b", label: "Table" },
    ],
    steps: [
      { id: "one", note: "Both.", regionIds: ["a", "b"] },
      { id: "two", note: "Second.", regionIds: ["b"] },
    ],
  };
  const r = rig([JSON.stringify(two)]);
  await r.controller.start("1");
  assert.deepEqual(r.pointing.focused, [[1, 2]], "only step 1 shows first");
  r.controller.next();
  r.controller.back();
  r.controller.overview();
  r.controller.step(1);
  r.controller.next();
  r.controller.next();
  assert.deepEqual(r.pointing.focused, [[1, 2], [2], [1, 2], null, [2], null]);
  assert.equal(r.events.at(-1).phase, "finished");
  r.controller.dispose();
});
test("the last step is drawn and finishing shows a closing bubble from Blink", async () => {
  const r = rig([JSON.stringify(threeSteps())]);
  await r.controller.start("1");
  r.controller.next();
  r.controller.next();
  assert.equal(r.events.at(-1).index, 2);
  assert.equal(
    r.events.at(-1).canNext,
    true,
    "Next on the last step finishes the tour",
  );
  assert.equal(r.events.at(-1).last, true);
  assert.deepEqual(
    r.pointing.focused.at(-1),
    [1],
    "the last step is drawn too",
  );
  r.controller.next();
  const done = r.events.at(-1);
  assert.equal(done.phase, "finished");
  assert.equal(done.bubbles.length, 1);
  assert.match(done.bubbles[0], /導覽/);
  assert.equal(done.canBack, true);
  assert.equal(done.canNext, false);
  assert.equal(r.pointing.focused.at(-1), null, "all marks again at the end");
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
test("finishing hands the saver the title, steps, explanation and screenshot", async () => {
  const r = rig([
    JSON.stringify({ ...threeSteps(), title: "Reading the report" }),
  ]);
  await r.controller.start("1");
  r.controller.next();
  r.controller.next();
  assert.equal(r.ended.length, 0, "not before the end");
  r.controller.next();
  assert.equal(r.ended.length, 1);
  const end = r.ended[0];
  assert.equal(end.title, "Reading the report");
  assert.equal(end.explanation, "Report overview.");
  assert.deepEqual(end.steps, [
    { n: 1, title: "Results", text: "Step one." },
    { n: 2, title: "Results", text: "Step two." },
    { n: 3, title: "Results", text: "Step three." },
  ]);
  assert.deepEqual(end.shots, [{ data: "pixels", width: 800, height: 600 }]);
  r.controller.next();
  r.controller.back();
  r.controller.next();
  assert.equal(
    r.ended.length,
    1,
    "finishing again does not offer a second save",
  );
  r.controller.dispose();
});
test("a guide without a title is named after its purpose", async () => {
  const r = rig([JSON.stringify(threeSteps())]);
  await r.controller.start("1");
  for (let i = 0; i < 4; i++) r.controller.next();
  assert.equal(r.ended[0].title, "Report overview.");
});
test("Next, Back, overview and end work across every step", async () => {
  const r = rig([JSON.stringify(threeSteps())]);
  await r.controller.start("1");
  const seq = [];
  const note = () =>
    seq.push(`${r.events.at(-1).phase}:${r.events.at(-1).index}`);
  note();
  r.controller.back(); // no step before the first
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
    "step:0",
    "step:0",
    "step:1",
    "step:2",
    "step:1",
    "overview:-1",
    "step:0",
    "step:1",
    "step:2",
    "finished:3",
  ]);
  r.controller.dismiss();
  assert.equal(r.controller.guide, null);
  assert.deepEqual(r.pointing.cleared, ["user", "user"], "marks are removed");
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
  assert.equal(r.pointing.shown.length, 1);
  assert.equal(r.pointing.shown[0].refs.length, 1);
  assert.equal(r.events.at(-1).phase, "step");
});
test("a failed turn names its reason in one sentence and retry reruns the guide", async () => {
  const r = rig([new Error("network down"), JSON.stringify(guide)]);
  await assert.rejects(r.controller.start("1"), /network down/);
  const failed = r.events.at(-1);
  assert.equal(failed.phase, "error");
  assert.match(failed.message, /^導覽暫時無法完成：.*network down.*。$/);
  assert.deepEqual(failed.bubbles, [failed.message]);
  assert.equal(failed.retry, true);
  assert.equal(failed.message.split(/[。！？]/).filter(Boolean).length, 1);
  await r.controller.retry();
  assert.equal(r.turns.length, 2, "retry reran the guide turn");
  assert.deepEqual(
    r.captures.map((c) => c[1]),
    ["1", "1"],
    "and captured the same display again",
  );
  assert.equal(r.events.at(-1).phase, "step");
  r.controller.dispose();
});
test("each way the guide can fail says why", async () => {
  const cases = [
    [{ replies: ["我看不到畫面"] }, /找不到|格式/],
    [{ replies: [JSON.stringify({ ...guide, steps: [] })] }, /步驟|區塊/],
    [{ replies: [], options: { session: null } }, /啟動/],
    [
      { replies: [Object.assign(Error("Guide response timed out"))] },
      /太久|逾時|沒有回覆/,
    ],
    [
      {
        replies: [],
        options: {
          capture: {
            run: async () => {
              throw Error("Screen capture unavailable");
            },
          },
        },
      },
      /擷取|截圖|畫面/,
    ],
  ];
  const messages = new Set();
  for (const [{ replies, options }, pattern] of cases) {
    const r = rig(replies, options);
    await assert.rejects(r.controller.start("1"));
    const failed = r.events.at(-1);
    assert.equal(failed.phase, "error");
    assert.match(failed.message, /^導覽暫時無法完成：/);
    assert.match(failed.message, pattern);
    assert.equal(failed.retry, true);
    assert.equal(r.pointing.shown.length, 0);
    assert.doesNotMatch(
      failed.message,
      /請再試一次。$/,
      "not the old blanket text",
    );
    messages.add(failed.message);
  }
  assert.equal(messages.size, cases.length, "every reason reads differently");
});
test("nothing drawable fails with that reason", async () => {
  const r = rig([JSON.stringify(guide)]);
  r.pointing.result = false;
  await r.controller.start("1");
  assert.equal(r.events.at(-1).phase, "error");
  assert.match(r.events.at(-1).message, /沒有.*標示|畫不出/);
  assert.equal(r.controller.guide, null);
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
test("clicking a mark focuses the first step that is about it", async () => {
  const two = {
    ...guide,
    sections: [
      guide.sections[0],
      { ...guide.sections[0], id: "b", label: "Table" },
    ],
    steps: [
      { id: "one", note: "First.", regionIds: ["a"] },
      { id: "two", note: "Second.", regionIds: ["b"] },
    ],
  };
  const r = rig([JSON.stringify(two)]);
  r.controller.focusMark(2);
  assert.equal(r.events.length, 0, "no guide yet, nothing to focus");
  await r.controller.start("1");
  r.controller.focusMark(2);
  assert.equal(r.events.at(-1).phase, "step");
  assert.equal(r.events.at(-1).index, 1);
  assert.deepEqual(r.pointing.focused.at(-1), [2]);
  r.controller.focusMark(9);
  assert.equal(r.events.at(-1).index, 1, "an unknown mark changes nothing");
  r.controller.dispose();
});

test("failure and closing bubbles speak the user's language, not Chinese for everyone", async () => {
  const en = rig([new Error("network down")], { language: () => "en-US" });
  await assert.rejects(en.controller.start("1"));
  assert.match(
    en.events.at(-1).message,
    /^The guide could not finish: Claude reported a problem \(network down\)\.$/,
  );
  const de = rig([JSON.stringify(guide)], { language: () => "de" });
  await de.controller.start("1");
  de.controller.finish();
  const finished = de.events.at(-1);
  assert.equal(finished.phase, "finished");
  assert.equal(finished.bubbles[0], closingMessage("de"));
  assert.match(finished.bubbles[0], /Anleitung/);
  assert.doesNotMatch(finished.bubbles[0], /Übersicht/);
});

test("every locale has every guide sentence, with Blinkling kept as written", () => {
  const keys = Object.keys(STRINGS.en);
  for (const [locale, table] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(table), keys, locale);
    for (const text of Object.values(table))
      assert.doesNotMatch(text, /布林克林|ブリンクリング/, locale);
  }
});
test("a step carries the screen rectangles of its regions, and ending the tour frees a held capture", async () => {
  const r = rig([fixture], { capture: { run: async () => bigCapture } });
  await r.controller.start("1");
  r.controller.step(0);
  const step = r.events.at(-1);
  assert.ok(step.rects.length >= 1);
  for (const rect of step.rects)
    assert.ok(rect.width > 0 && rect.x >= 0 && rect.y >= 0);
  r.controller.overview();
  assert.equal(
    r.events.at(-1).rects.length,
    r.controller.guide.sections.length,
  );
  r.controller.finish();
  assert.deepEqual(r.events.at(-1).rects, []);
  let dismissed = null;
  r.overlay.capture = { id: 1 };
  r.overlay.dismiss = (reason) => (dismissed = reason);
  r.controller.dismiss();
  assert.equal(dismissed, "user", "the capture is let go");
});

test("ending a guide leaves no offer to show it again", async () => {
  const r = rig([JSON.stringify(threeSteps())]);
  await r.controller.start("1");
  r.controller.dismiss();
  assert.equal(r.events.at(-1).phase, "dismissed");
  assert.equal("again" in r.events.at(-1), false);
  assert.equal(typeof r.controller.reopen, "undefined");
  r.controller.dispose();
});
test("closing a guide that still looks at the screen clears what the card showed", async () => {
  let release;
  const r = rig([new Promise((resolve) => (release = resolve))]);
  const running = r.controller.start("1").catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.events.at(-1).phase, "thinking");
  r.controller.dismiss();
  assert.equal(r.events.at(-1).phase, "dismissed");
  release(JSON.stringify(threeSteps()));
  await running;
  assert.equal(r.events.at(-1).phase, "dismissed", "nothing draws afterwards");
  r.controller.dispose();
});

const anchorFake = (ok = true) => {
  const calls = { attached: [], revealed: [], detached: 0 };
  return {
    calls,
    attach: async (rects) => {
      calls.attached.push(rects);
      return ok;
    },
    reveal: async (n) => calls.revealed.push(n),
    detach: () => calls.detached++,
  };
};
const noted = (r) => {
  const out = [];
  r.pointing.note = (arg) => out.push(arg);
  r.pointing.keep = (arg) => out.push({ keep: arg });
  return out;
};

test("each step's explanation is a note under its mark and Next scrolls the page to it", async () => {
  const anchor = anchorFake();
  const r = rig([JSON.stringify(threeSteps())], { anchor });
  const out = noted(r);
  await r.controller.start("1");
  assert.deepEqual(anchor.calls.attached[0], [
    { n: 1, x: 10, y: 10, width: 100, height: 80 },
  ]);
  assert.deepEqual(out[0], { keep: { anchored: true, hold: true } });
  assert.equal(out[1].n, 1);
  assert.equal(out[1].text, "Step one.");
  assert.equal(out[1].hint, "", "anchored marks have nothing to apologise for");
  assert.equal(out[1].count, "1 / 3");
  assert.equal(out[1].canBack, false);
  assert.deepEqual(anchor.calls.revealed, [], "the first step needs no scroll");
  r.controller.next();
  assert.equal(out.at(-1).text, "Step two.");
  assert.deepEqual(anchor.calls.revealed, [1]);
  r.controller.back();
  assert.equal(out.at(-1).text, "Step one.");
  assert.equal(anchor.calls.revealed.length, 2);
  r.overlay.emit("dismissed", "user");
  assert.equal(anchor.calls.detached >= 1, true);
});

test("without the browser helper the marks keep the screen and the note says so", async () => {
  const anchor = anchorFake(false);
  const r = rig([JSON.stringify(threeSteps())], { anchor });
  const out = noted(r);
  await r.controller.start("1");
  assert.deepEqual(out[0], { keep: { anchored: false, hold: true } });
  assert.match(out[1].hint, /./);
  r.controller.next();
  assert.deepEqual(anchor.calls.revealed, [], "nothing to scroll");
});

test("the note's own Previous, Next and End drive the guide", async () => {
  const r = rig([JSON.stringify(threeSteps())], { anchor: anchorFake() });
  noted(r);
  await r.controller.start("1");
  r.overlay.emit("nav", "next");
  assert.equal(r.events.at(-1).index, 1);
  r.overlay.emit("nav", "back");
  assert.equal(r.events.at(-1).index, 0);
});

test("the guide goes into the chat as the screen on the user side and the steps on the answer side", async () => {
  const lines = [];
  const r = rig([JSON.stringify(threeSteps())], {
    record: async (l) => lines.push(...l),
  });
  await r.controller.start("1");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    lines.map((l) => l.role),
    ["user", "assistant"],
  );
  assert.equal(lines[0].content[0].type, "image");
  assert.match(lines[1].content[0].text, /1\. Step one\./);
  assert.match(lines[1].content[0].text, /3\. Step three\./);
});

test("a record that fails does not stop the guide", async () => {
  const r = rig([JSON.stringify(threeSteps())], {
    record: async () => {
      throw Error("disk");
    },
  });
  await r.controller.start("1");
  assert.equal(r.events.at(-1).phase, "step");
});
