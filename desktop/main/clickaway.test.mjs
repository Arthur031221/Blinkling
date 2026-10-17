import test from "node:test";
import assert from "node:assert/strict";
import {
  outsidePress,
  createHookedPress,
  HOOKED_PLATFORMS,
} from "./clickaway.mjs";

test("a press counts only away from Blinkling, with nothing carried and no pick running", () => {
  assert.equal(
    outsidePress({ over: false, dragging: false, picking: false }),
    true,
  );
  assert.equal(
    outsidePress({ over: true, dragging: false, picking: false }),
    false,
  );
  assert.equal(
    outsidePress({ over: false, dragging: true, picking: false }),
    false,
  );
  assert.equal(
    outsidePress({ over: false, dragging: false, picking: true }),
    false,
  );
});

const press = (platform, state = {}) => {
  const ended = [];
  const handler = createHookedPress({
    platform,
    point: () => state.point ?? { x: 10, y: 10 },
    over: () => state.over ?? false,
    dragging: () => state.dragging ?? false,
    picking: () => state.picking ?? false,
    outside: () => ended.push(true),
  });
  return { handler, ended };
};

test("a background click on macOS and Windows ends the card even when it never had focus", () => {
  for (const platform of ["darwin", "win32"]) {
    const { handler, ended } = press(platform);
    assert.equal(handler(), true, platform);
    assert.equal(ended.length, 1, platform);
  }
});

test("a click on Blink, the card or a panel, a carry and a pick never end the card", () => {
  for (const state of [{ over: true }, { dragging: true }, { picking: true }]) {
    const { handler, ended } = press("darwin", state);
    assert.equal(handler(), false);
    assert.equal(ended.length, 0);
  }
});

test("Linux is read from the pointer state in the main loop, not from the hook", () => {
  assert.deepEqual([...HOOKED_PLATFORMS].sort(), ["darwin", "win32"]);
  const { handler, ended } = press("linux");
  assert.equal(handler(), false);
  assert.equal(ended.length, 0);
});

test("no pointer, no decision", () => {
  const ended = [];
  const handler = createHookedPress({
    platform: "win32",
    point: () => null,
    over: () => false,
    dragging: () => false,
    picking: () => false,
    outside: () => ended.push(1),
  });
  assert.equal(handler(), false);
  assert.equal(ended.length, 0);
});
