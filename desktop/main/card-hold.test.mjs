import test from "node:test";
import assert from "node:assert/strict";
import { cardHeld, leaveCloses, validHold, noHold } from "./card-hold.mjs";

const idle = {
  open: true,
  pinned: false,
  leaving: true,
  focused: false,
  draft: false,
  chips: false,
  dialog: false,
};
test("an empty, unfocused, unpinned card closes on leave", () => {
  assert.equal(leaveCloses(idle), true);
});
for (const reason of ["focused", "draft", "chips", "dialog", "pinned"])
  test(`${reason} keeps the card open on leave`, () => {
    assert.equal(leaveCloses({ ...idle, [reason]: true }), false);
  });
test("without a leave the card stays", () => {
  assert.equal(leaveCloses({ ...idle, leaving: false }), false);
});
test("a closed card has nothing to close", () => {
  assert.equal(leaveCloses({ ...idle, open: false }), false);
});
test("cardHeld is the union of focus, draft, chip and dialog", () => {
  assert.equal(cardHeld({}), false);
  for (const key of ["focused", "draft", "chips", "dialog"])
    assert.equal(cardHeld({ [key]: true }), true);
});
test("hold reports from the card are validated", () => {
  assert.deepEqual(validHold({ chips: true, dialog: false, x: 1 }), {
    chips: true,
    dialog: false,
  });
  for (const bad of [null, "yes", {}, { chips: 1, dialog: false }])
    assert.equal(validHold(bad), null);
  assert.deepEqual(noHold, { chips: false, dialog: false });
});
