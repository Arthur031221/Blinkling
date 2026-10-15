import test from "node:test";
import assert from "node:assert/strict";
import { FACES, faceFor } from "./face.mjs";

const keys = {
  lock: "lock",
  permission: "permission",
  "usage-limit": "usageLimit",
  error: "error",
  thinking: "thinking",
  talking: "talking",
  watching: "watching",
};

test("the table lists every face once, highest priority first, idle last", () => {
  assert.deepEqual(
    [...FACES],
    [
      "lock",
      "permission",
      "usage-limit",
      "error",
      "thinking",
      "talking",
      "watching",
      "idle",
    ],
  );
  assert.equal(Object.isFrozen(FACES), true);
});

test("nothing active is idle", () => {
  assert.deepEqual(faceFor({}), { face: "idle", detail: {} });
  assert.deepEqual(faceFor(), { face: "idle", detail: {} });
});

for (const face of FACES.filter((name) => name !== "idle"))
  test(`${face} alone shows the ${face} face`, () => {
    assert.equal(faceFor({ [keys[face]]: true }).face, face);
  });

for (let i = 0; i < FACES.length - 1; i++)
  for (let j = i + 1; j < FACES.length - 1; j++)
    test(`${FACES[i]} beats ${FACES[j]}`, () => {
      const both = { [keys[FACES[i]]]: true, [keys[FACES[j]]]: true };
      assert.equal(faceFor(both).face, FACES[i]);
      // The order of the keys the caller wrote must not matter.
      assert.equal(
        faceFor({ [keys[FACES[j]]]: true, [keys[FACES[i]]]: true }).face,
        FACES[i],
      );
    });

test("every state active at once is the lock face", () => {
  assert.equal(
    faceFor(Object.fromEntries(Object.values(keys).map((k) => [k, true]))).face,
    "lock",
  );
});

test("the usage limit carries its reset time for the hover hint", () => {
  assert.deepEqual(
    faceFor({ usageLimit: { resetAt: "2026-10-15T20:00:00Z" } }),
    {
      face: "usage-limit",
      detail: { resetAt: "2026-10-15T20:00:00Z" },
    },
  );
  assert.deepEqual(faceFor({ usageLimit: 1760558400000 }).detail, {
    resetAt: 1760558400000,
  });
  assert.deepEqual(faceFor({ usageLimit: true }).detail, {});
  // A hidden limit does not leak its time into the face that won.
  assert.deepEqual(
    faceFor({ lock: true, usageLimit: { resetAt: 5 } }).detail,
    {},
  );
});
