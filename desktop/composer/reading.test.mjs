import assert from "node:assert/strict";
import { test } from "node:test";
import { INPUT_WINDOW, readerScroll } from "./reading.mjs";

test("a scroll the card makes itself is not the reader's", () => {
  let t = 5000;
  const reading = readerScroll(() => t);
  assert.equal(reading.isReader(), false);
});

test("a scroll right after the reader's input is theirs, and not after a pause", () => {
  let t = 5000;
  const reading = readerScroll(() => t);
  reading.input();
  t += 200;
  assert.equal(reading.isReader(), true);
  t += INPUT_WINDOW;
  assert.equal(reading.isReader(), false);
});
