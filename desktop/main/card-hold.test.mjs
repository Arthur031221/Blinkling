import test from "node:test";
import assert from "node:assert/strict";
import {
  cardHeld,
  claimFocus,
  leaveCloses,
  noHold,
  sendCloses,
  validHold,
} from "./card-hold.mjs";

const idle = {
  pointer: false,
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
for (const reason of [
  "focused",
  "draft",
  "chips",
  "dialog",
  "pointer",
  "pinned",
])
  test(`${reason} keeps the card open on leave`, () => {
    assert.equal(leaveCloses({ ...idle, [reason]: true }), false);
  });
test("without a leave the card stays", () => {
  assert.equal(leaveCloses({ ...idle, leaving: false }), false);
});
test("a closed card has nothing to close", () => {
  assert.equal(leaveCloses({ ...idle, open: false }), false);
});
test("cardHeld is the union of focus, draft, chip, dialog and pointer", () => {
  assert.equal(cardHeld({}), false);
  for (const key of ["focused", "draft", "chips", "dialog", "pointer"])
    assert.equal(cardHeld({ [key]: true }), true);
});
test("hold reports from the card are validated", () => {
  assert.deepEqual(validHold({ chips: true, dialog: false, x: 1 }), {
    chips: true,
    dialog: false,
    pointer: false,
  });
  assert.deepEqual(validHold({ chips: false, dialog: true, pointer: true }), {
    chips: false,
    dialog: true,
    pointer: true,
  });
  for (const bad of [
    null,
    "yes",
    {},
    { chips: 1, dialog: false },
    { chips: true, dialog: false, pointer: "yes" },
  ])
    assert.equal(validHold(bad), null);
  assert.deepEqual(noHold, { chips: false, dialog: false, pointer: false });
});

test("unpinning with the pointer on the card keeps it; away from it the card goes", () => {
  const unpinned = { ...idle, pinned: false, leaving: true };
  assert.equal(leaveCloses({ ...unpinned, pointer: true }), false);
  assert.equal(leaveCloses({ ...unpinned, pointer: false }), true);
});

test("an open composer with the keyboard or a draft survives the pointer leaving", () => {
  assert.equal(leaveCloses({ ...idle, focused: true }), false);
  assert.equal(leaveCloses({ ...idle, draft: true }), false);
});

test("an outside click with an empty draft closes the card, with a draft it stays", () => {
  const afterClick = { ...idle, focused: false };
  assert.equal(leaveCloses(afterClick), true);
  assert.equal(leaveCloses({ ...afterClick, draft: true }), false);
});

test("a typed send closes an unpinned card unless the pointer is on it", () => {
  assert.equal(
    sendCloses({ pinned: false, pointer: false, source: "composer" }),
    true,
  );
  assert.equal(
    sendCloses({ pinned: false, pointer: true, source: "composer" }),
    false,
  );
  assert.equal(
    sendCloses({ pinned: true, pointer: false, source: "composer" }),
    false,
  );
});

test("a quick ask closes an unpinned card even though the pointer is on it", () => {
  assert.equal(
    sendCloses({ pinned: false, pointer: true, source: "quick-ask" }),
    true,
  );
  assert.equal(
    sendCloses({ pinned: true, pointer: true, source: "quick-ask" }),
    false,
  );
});

/** A manual clock so the retry loop is deterministic. */
function clock() {
  let time = 0;
  const queue = [];
  return {
    now: () => time,
    schedule: (fn, ms) => queue.push({ fn, at: time + ms }),
    run(until) {
      while (queue.length) {
        queue.sort((a, b) => a.at - b.at);
        if (queue[0].at > until) break;
        const next = queue.shift();
        time = next.at;
        next.fn();
      }
      time = until;
    },
    pending: () => queue.length,
  };
}

test("claimFocus asks again whenever the card does not have the keyboard", () => {
  const c = clock();
  let focused = false,
    claims = 0;
  claimFocus({
    focused: () => focused,
    claim: () => {
      claims++;
      focused = claims >= 3;
    },
    ...c,
  });
  c.run(1000);
  assert.equal(claims, 3);
});

test("claimFocus takes the keyboard back when the window manager hands it away right after opening", () => {
  const c = clock();
  let focused = true,
    claims = 0;
  claimFocus({
    focused: () => focused,
    claim: () => {
      claims++;
      focused = true;
    },
    ...c,
  });
  c.schedule(() => (focused = false), 70);
  c.run(1000);
  assert.equal(claims, 1);
  assert.equal(focused, true);
});

test("claimFocus gives up after the settle period so a later click elsewhere wins", () => {
  const c = clock();
  let claims = 0;
  claimFocus({
    focused: () => false,
    claim: () => claims++,
    settle: 300,
    ...c,
  });
  c.run(5000);
  const atEnd = claims;
  assert.ok(atEnd > 0 && atEnd <= 6);
  assert.equal(c.pending(), 0);
});

test("claimFocus stops when the card closes or the caller cancels", () => {
  const c = clock();
  let claims = 0,
    wanted = true;
  const cancel = claimFocus({
    focused: () => false,
    claim: () => claims++,
    wanted: () => wanted,
    ...c,
  });
  c.run(130);
  const before = claims;
  wanted = false;
  c.run(1000);
  assert.equal(claims, before);
  const again = clock();
  let more = 0;
  const stop = claimFocus({
    focused: () => false,
    claim: () => more++,
    ...again,
  });
  stop();
  again.run(1000);
  assert.equal(more, 0);
  cancel();
});
