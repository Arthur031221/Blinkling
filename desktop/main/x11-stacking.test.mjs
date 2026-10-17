import test from "node:test";
import assert from "node:assert/strict";
import { mayRaise, raiseInOrder, stackOrder } from "./x11-stacking.mjs";

test("Blink is raised after the chat card so the card never covers a menu pill", () => {
  const w = Object.fromEntries(
    ["overlay", "guides", "card", "blink"].map((name) => [name, { name }]),
  );
  const order = stackOrder(w).map((x) => x.name);
  assert.deepEqual(order, ["overlay", "guides", "card", "blink"]);
  assert.ok(order.indexOf("blink") > order.indexOf("card"));
});
test("missing windows are skipped without changing the relative order", () => {
  const order = stackOrder({
    overlay: null,
    guides: undefined,
    card: { name: "b" },
    blink: { name: "k" },
  }).map((x) => x.name);
  assert.deepEqual(order, ["b", "k"]);
});
test("a window that can take the keyboard is raised only when it appears or has the focus", () => {
  const card = (focusable, focused) => ({
    isFocusable: () => focusable,
    isFocused: () => focused,
  });
  assert.equal(mayRaise(card(false, false)), true);
  assert.equal(mayRaise(card(true, false)), false);
  assert.equal(mayRaise(card(true, true)), true);
  assert.equal(mayRaise(card(true, false), true), true);
});
test("while the image viewer is up it is the only window kept on top, so nothing is raised over it", () => {
  const w = Object.fromEntries(
    ["overlay", "guides", "card", "blink", "viewer"].map((name) => [
      name,
      { name },
    ]),
  );
  assert.deepEqual(
    stackOrder(w).map((x) => x.name),
    ["viewer"],
  );
  assert.deepEqual(
    stackOrder({ ...w, viewer: null }).map((x) => x.name),
    ["overlay", "guides", "card", "blink"],
  );
});
test("a flying capture is stacked above Blink so it is seen entering the mouth", () => {
  const w = Object.fromEntries(
    ["overlay", "guides", "card", "blink"].map((name) => [name, { name }]),
  );
  const order = stackOrder({ ...w, flight: [{ name: "flight" }] }).map(
    (x) => x.name,
  );
  assert.deepEqual(order, ["overlay", "guides", "card", "blink", "flight"]);
  assert.deepEqual(
    stackOrder({ ...w, flight: [] }).map((x) => x.name),
    ["overlay", "guides", "card", "blink"],
  );
});
test("the other systems raise the windows again from the bottom up, skipping gone ones", () => {
  const calls = [];
  const win = (name, over = {}) => ({
    isDestroyed: () => false,
    isVisible: () => true,
    moveTop: () => calls.push(name),
    ...over,
  });
  raiseInOrder(
    stackOrder({
      guides: win("guides"),
      card: win("card", { isVisible: () => false }),
      blink: win("blink"),
      flight: [win("gone", { isDestroyed: () => true })],
    }),
  );
  assert.deepEqual(calls, ["guides", "blink"]);
});
