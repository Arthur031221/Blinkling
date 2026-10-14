import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyHold,
  parseHold,
  holdsCard,
  closesOnLeave,
} from "./composer-hold.mjs";
const open = { chatOpen: true, pinned: false, focused: false };
test("an idle, empty, unfocused card closes when the pointer leaves", () => {
  assert.equal(closesOnLeave({ ...open, hold: emptyHold() }), true);
});
test("the card stays open while it has focus", () => {
  assert.equal(
    closesOnLeave({ ...open, focused: true, hold: emptyHold() }),
    false,
  );
});
test("the card stays open while the draft is not empty", () => {
  assert.equal(
    closesOnLeave({ ...open, hold: { ...emptyHold(), draft: true } }),
    false,
  );
});
test("the card stays open while a chip waits, for example right after a capture", () => {
  assert.equal(
    closesOnLeave({ ...open, hold: { ...emptyHold(), chips: 1 } }),
    false,
  );
});
test("the card stays open while the attach dialog is open", () => {
  assert.equal(
    closesOnLeave({ ...open, hold: { ...emptyHold(), dialog: true } }),
    false,
  );
});
test("a pinned or already closed card is never closed by leaving", () => {
  assert.equal(
    closesOnLeave({ ...open, pinned: true, hold: emptyHold() }),
    false,
  );
  assert.equal(
    closesOnLeave({ ...open, chatOpen: false, hold: emptyHold() }),
    false,
  );
});
test("holding is released as soon as every reason is gone", () => {
  assert.equal(holdsCard({ focused: false, hold: emptyHold() }), false);
});
test("renderer input is validated to plain booleans and a small integer", () => {
  assert.deepEqual(
    parseHold({ draft: true, chips: 2, dialog: false, extra: 1 }),
    {
      draft: true,
      chips: 2,
      dialog: false,
    },
  );
  for (const bad of [
    null,
    "x",
    {},
    { draft: 1, chips: 0, dialog: false },
    { draft: true, chips: -1, dialog: false },
    { draft: true, chips: 1.5, dialog: false },
    { draft: true, chips: 0, dialog: "yes" },
  ])
    assert.equal(parseHold(bad), null);
});
