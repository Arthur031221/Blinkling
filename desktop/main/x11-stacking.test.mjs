import test from "node:test";
import assert from "node:assert/strict";
import { stackOrder } from "./x11-stacking.mjs";
const w = (name) => ({ name });
test("Blink is the topmost window so the menu it draws is never covered by the bubble deck", () => {
  const [blink, bubbles, selection, guide] = [
    w("blink"),
    w("bubbles"),
    w("sel"),
    w("guide"),
  ];
  const order = stackOrder({ blink, bubbles, overlays: [selection, guide] });
  assert.equal(order.at(-1), blink);
  assert.ok(order.indexOf(bubbles) < order.indexOf(blink));
  assert.deepEqual(order, [selection, guide, bubbles, blink]);
});
test("missing windows are skipped", () => {
  const blink = w("blink");
  assert.deepEqual(
    stackOrder({ blink, bubbles: null, overlays: [null, undefined] }),
    [blink],
  );
});
