import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMutter,
  mutterTime,
  MUTTER_MAX_MS,
  MUTTER_MIN_MS,
  MUTTER_PARTIAL_MS,
} from "./mutter.mjs";

const rig = () => {
  const node = { dataset: { shown: "false" }, textContent: "" };
  const timers = [];
  const mutter = createMutter({
    node,
    schedule: (fn, ms) => timers.push({ fn, ms }) - 1,
    cancel: (id) => {
      timers[id] = null;
    },
  });
  return { node, timers, mutter };
};

test("the reading time is bounded and counts CJK characters", () => {
  assert.equal(mutterTime("Hi"), MUTTER_MIN_MS);
  assert.equal(mutterTime("word ".repeat(500)), MUTTER_MAX_MS);
  assert.ok(
    mutterTime("這個畫面是一份設定頁面，可以調整語言與外觀。") > MUTTER_MIN_MS,
  );
});

test("a streamed answer shows at once and a final one goes after its reading time", () => {
  const { node, timers, mutter } = rig();
  mutter.accept({ text: "A page", final: false });
  assert.equal(node.dataset.shown, "true");
  assert.equal(timers.at(-1).ms, MUTTER_PARTIAL_MS);
  mutter.accept({ text: "A page about weather.", final: true });
  assert.equal(node.textContent, "A page about weather.");
  assert.equal(timers[0], null, "the partial timer was replaced");
  assert.equal(timers.at(-1).ms, mutterTime("A page about weather."));
  timers.at(-1).fn();
  assert.equal(node.dataset.shown, "false");
});

test("non-ASCII text is kept exactly and never read as markup", () => {
  const { node, mutter } = rig();
  const text = "這是設定頁面 ✓ ありがとう 한국어 <b>x</b> 😀";
  mutter.accept({ text, final: true });
  assert.equal(node.textContent, text);
});

test("empty text and hide put the bubble away", () => {
  const { node, mutter } = rig();
  mutter.accept({ text: "Hello", final: true });
  mutter.accept({ text: "  ", final: true });
  assert.equal(node.dataset.shown, "false");
  mutter.accept({ text: "Again", final: true });
  mutter.hide();
  assert.equal(mutter.shown, false);
});
