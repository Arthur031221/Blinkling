import test from "node:test";
import assert from "node:assert/strict";
import { DRAFT_IDLE_MS, draftHolds } from "./draft.mjs";

test("a draft holds Auto explain back while keys are pressed and lets go once they stop", () => {
  const typingAt = 1000;
  assert.equal(draftHolds({ typing: true, typingAt, now: 1500 }), true);
  assert.equal(
    draftHolds({ typing: true, typingAt, now: typingAt + DRAFT_IDLE_MS - 1 }),
    true,
  );
  assert.equal(
    draftHolds({ typing: true, typingAt, now: typingAt + DRAFT_IDLE_MS }),
    false,
    "a draft that sits there is not typing",
  );
  assert.equal(draftHolds({ typing: false, typingAt, now: 1100 }), false);
});
