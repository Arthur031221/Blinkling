import assert from "node:assert/strict";
import { test } from "node:test";
import { middle, sample } from "./sample.mjs";

const recorder = () => {
  const steps = [];
  const image = {
    resize(size) {
      steps.push(size);
      return image;
    },
    toBitmap: () => Buffer.from([1]),
  };
  return { image, steps };
};

test("a sample is shrunk through the middle size, whatever the source size", () => {
  const size = { width: 160, height: 90 };
  const a = recorder();
  const b = recorder();
  sample(a.image, size);
  sample(b.image, size);
  assert.deepEqual(a.steps, [middle(size), size]);
  assert.deepEqual(a.steps, b.steps);
  assert.deepEqual(middle(size), { width: 640, height: 360 });
});
