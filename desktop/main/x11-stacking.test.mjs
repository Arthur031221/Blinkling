import test from "node:test";
import assert from "node:assert/strict";
import { stackOrder } from "./x11-stacking.mjs";

test("Blink is raised after the answer deck so a bubble never covers a menu pill", () => {
  const w = Object.fromEntries(
    ["overlay", "guides", "bubbles", "blink"].map((name) => [name, { name }]),
  );
  const order = stackOrder(w).map((x) => x.name);
  assert.deepEqual(order, ["overlay", "guides", "bubbles", "blink"]);
  assert.ok(order.indexOf("blink") > order.indexOf("bubbles"));
});
test("missing windows are skipped without changing the relative order", () => {
  const order = stackOrder({
    overlay: null,
    guides: undefined,
    bubbles: { name: "b" },
    blink: { name: "k" },
  }).map((x) => x.name);
  assert.deepEqual(order, ["b", "k"]);
});
