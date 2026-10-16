import assert from "node:assert/strict";
import { test } from "node:test";
import { LONG_ANSWER, reactionFor } from "./reactions.mjs";

test("a long answer is celebrated", () => {
  assert.equal(reactionFor({ words: LONG_ANSWER }), "celebrate");
  assert.equal(reactionFor({ words: 500 }), "celebrate");
});

test("no answer or a failed one gets a shrug", () => {
  assert.equal(reactionFor({ words: 0 }), "shrug");
  assert.equal(reactionFor({ words: 300, failed: true }), "shrug");
  assert.equal(reactionFor(), "shrug");
});

test("an ordinary answer gets no extra motion", () => {
  assert.equal(reactionFor({ words: LONG_ANSWER - 1 }), null);
  assert.equal(reactionFor({ words: 12 }), null);
});
