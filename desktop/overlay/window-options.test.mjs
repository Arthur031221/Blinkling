import test from "node:test";
import assert from "node:assert/strict";
import { overlayWindowOptions } from "./window-options.mjs";

test("the overlay asks for the whole display and may sit over the menu bar", () => {
  const display = { bounds: { x: 0, y: 0, width: 1440, height: 900 } };
  const options = overlayWindowOptions(display, "/preload.cjs");
  assert.equal(options.enableLargerThanScreen, true);
  assert.deepEqual(
    [options.x, options.y, options.width, options.height],
    [0, 0, 1440, 900],
  );
  assert.equal(options.focusable, false);
  assert.equal(options.webPreferences.sandbox, true);
});
