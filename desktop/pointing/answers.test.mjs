import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createAnswerPointing } from "./answers.mjs";
import { createPointing } from "./index.mjs";
import {
  DISPLAY,
  WINDOW,
  createOverlayFake,
  createPointingLocator,
} from "./test/locator.mjs";

const shot = { mediaType: "image/png", data: "x", name: "screen" };
function rig() {
  const overlay = createOverlayFake();
  const locator = createPointingLocator();
  const bubbles = new EventEmitter();
  const pointing = createPointing({ locator, overlay, bubbles });
  const answers = createAnswerPointing({
    pointing,
    display: () => DISPLAY,
    window: async () => WINDOW,
  });
  return { overlay, answers, pointing };
}
const said = (id, text) => ({
  type: "message",
  id,
  role: "assistant",
  content: [{ type: "text", text }],
});

test("a screen question carries the element list; a plain one does not", async () => {
  const r = rig();
  const screen = await r.answers.ask({
    id: "t1",
    source: "composer",
    text: "What is this?",
    attachments: [shot],
  });
  assert.match(screen.text, /^What is this\?/);
  assert.match(screen.text, /img-1 image Photo of a lake/);
  const plain = await r.answers.ask({
    id: "t2",
    source: "composer",
    text: "Hi",
    attachments: [],
  });
  assert.equal(plain.text, "Hi");
  const guide = await r.answers.ask({
    id: "t3",
    source: "guide",
    text: "Map",
    attachments: [shot],
  });
  assert.equal(guide.text, "Map", "the guide has its own prompt");
  const chip = await r.answers.ask({
    id: "t4",
    source: "quick-ask",
    text: "這是什麼",
    attachments: [shot],
  });
  assert.equal(chip.text, "這是什麼", "a chip sends exactly its own words");
});

test("the finished answer is drawn as marks, one per element it named", async () => {
  const r = rig();
  await r.answers.ask({
    id: "t1",
    source: "composer",
    text: "q",
    attachments: [shot],
  });
  await r.answers.event(
    said("a1", "The photo [[1:img-1|lake]] and the table [[2:table-1|data]]."),
  );
  assert.equal(r.overlay.shown.length, 0, "nothing is drawn mid-answer");
  assert.equal(await r.answers.event({ type: "done", turnId: "t1" }), true);
  const [{ drawings }] = r.overlay.shown;
  assert.deepEqual(
    drawings.map((d) => [d.n, d.elementId]),
    [
      [1, "img-1"],
      [2, "table-1"],
    ],
  );
  assert.equal(r.answers.refOf(2), "table-1");
});

test("an answer that names nothing, or another turn, draws nothing", async () => {
  const r = rig();
  await r.answers.ask({
    id: "t1",
    source: "composer",
    text: "q",
    attachments: [shot],
  });
  await r.answers.event(said("a1", "Nothing special here."));
  assert.equal(await r.answers.event({ type: "done", turnId: "t1" }), false);
  assert.equal(await r.answers.event({ type: "done", turnId: "other" }), false);
  assert.equal(r.overlay.shown.length, 0);
});

test("asking again takes the old marks away", async () => {
  const r = rig();
  await r.answers.ask({
    id: "t1",
    source: "composer",
    text: "q",
    attachments: [shot],
  });
  await r.answers.event(said("a1", "[[1:img-1|lake]]"));
  await r.answers.event({ type: "done", turnId: "t1" });
  assert.equal(r.pointing.active, true);
  await r.answers.ask({
    id: "t2",
    source: "composer",
    text: "again",
    attachments: [],
  });
  assert.equal(r.pointing.active, false);
});
