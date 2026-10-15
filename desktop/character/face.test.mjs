import test from "node:test";
import assert from "node:assert/strict";
import { FACES, faceFor } from "./face.mjs";

const inputs = {
  lock: { lock: true },
  permission: { permission: true },
  "usage-limit": { usageLimit: { resetAt: 1_700_000_000_000 } },
  error: { error: true },
  thinking: { thinking: true },
  talking: { talking: true },
  watching: { watching: true },
  idle: {},
};

test("the table lists the states from highest to lowest priority", () => {
  assert.deepEqual(FACES, [
    "lock",
    "permission",
    "usage-limit",
    "error",
    "thinking",
    "talking",
    "watching",
    "idle",
  ]);
  assert.ok(Object.isFrozen(FACES));
});

for (const face of FACES)
  test(`${face} shows when it is the only state`, () => {
    assert.equal(faceFor(inputs[face]).face, face);
  });

test("nothing set is idle, and so is a call with no arguments", () => {
  assert.equal(faceFor({}).face, "idle");
  assert.equal(faceFor().face, "idle");
  assert.deepEqual(faceFor({}).detail, {});
});

for (let i = 0; i < FACES.length; i++)
  for (let j = i + 1; j < FACES.length; j++)
    test(`${FACES[i]} wins over ${FACES[j]}`, () => {
      const both = { ...inputs[FACES[i]], ...inputs[FACES[j]] };
      assert.equal(faceFor(both).face, FACES[i]);
    });

test("every state at once resolves to lock, and each removal falls to the next", () => {
  const all = Object.assign({}, ...Object.values(inputs));
  for (const face of FACES.slice(0, -1)) {
    assert.equal(faceFor(all).face, face);
    for (const key of Object.keys(inputs[face])) delete all[key];
  }
  assert.equal(faceFor(all).face, "idle");
});

test("usage limit carries the reset time for the hover text", () => {
  const { detail } = faceFor({ usageLimit: { resetAt: 1_700_000_000_000 } });
  assert.deepEqual(detail, { resetAt: 1_700_000_000_000 });
  assert.deepEqual(faceFor({ usageLimit: 1_700_000_000_000 }).detail, {
    resetAt: 1_700_000_000_000,
  });
});

test("a usage limit with no known reset time still shows, without a time", () => {
  assert.deepEqual(faceFor({ usageLimit: true }).detail, { resetAt: null });
  assert.equal(faceFor({ usageLimit: {} }).face, "usage-limit");
});

test("only usage limit has detail", () => {
  for (const face of FACES.filter((f) => f !== "usage-limit"))
    assert.deepEqual(faceFor(inputs[face]).detail, {}, face);
});
