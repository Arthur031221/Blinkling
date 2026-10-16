import test from "node:test";
import assert from "node:assert/strict";
import { wantedHeight, WINDOW_MARGIN } from "./size.mjs";

test("an empty history asks for the header and the composer only", () => {
  assert.equal(
    wantedHeight({ card: 200, historyShown: 34, historyContent: 34 }),
    200 + WINDOW_MARGIN,
  );
});

test("a long history asks for all of its content, more than is shown", () => {
  assert.equal(
    wantedHeight({ card: 492, historyShown: 300, historyContent: 900 }),
    492 - 300 + 900 + WINDOW_MARGIN,
  );
});

test("a card that is not on screen asks for nothing", () => {
  assert.equal(
    wantedHeight({ card: 0, historyShown: 0, historyContent: 0 }),
    0,
  );
});
