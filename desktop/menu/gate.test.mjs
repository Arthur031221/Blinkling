import test from "node:test";
import assert from "node:assert/strict";
import { fanWanted } from "./gate.mjs";

const rested = { ready: true, stay: true, chatOpen: false, miniOpen: false };

test("the fan opens once Blink is rested on and revealed", () => {
  assert.equal(fanWanted(rested), true);
});

test("the fan stays closed while the mini composer is open (NS-3)", () => {
  assert.equal(fanWanted({ ...rested, miniOpen: true }), false);
});

test("the fan stays closed while the conversation card is open", () => {
  assert.equal(fanWanted({ ...rested, chatOpen: true }), false);
});

test("no rest or no reveal keeps the fan closed", () => {
  assert.equal(fanWanted({ ...rested, ready: false }), false);
  assert.equal(fanWanted({ ...rested, stay: false }), false);
});
