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
