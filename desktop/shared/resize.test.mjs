import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { attachResize, HANDLES } from "./resize.mjs";

function setup() {
  const { window } = new JSDOM("<section id=card></section>");
  const sent = [];
  const card = window.document.querySelector("#card");
  attachResize(card, {
    send: (m) => sent.push(m),
    signal: new window.AbortController().signal,
  });
  const fire = (target, type, init = {}) =>
    target.dispatchEvent(
      Object.assign(new window.Event(type, { bubbles: true }), {
        button: 0,
        pointerId: 1,
        ...init,
      }),
    );
  const handle = (edge) => card.querySelector(`[data-edge="${edge}"]`);
  return { sent, card, fire, handle };
}

test("the card has a handle on each of its four edges and four corners", () => {
  const { card } = setup();
  assert.deepEqual(
    [...card.querySelectorAll(".gl-resize")].map((n) => n.dataset.edge),
    [...HANDLES],
  );
});

test("a drag from a corner reports the pointer's travel from where it began, and ends on release", () => {
  const { sent, card, fire, handle } = setup();
  const se = handle("se");
  fire(se, "pointerdown", { screenX: 500, screenY: 400 });
  assert.equal(card.dataset.resizing, "se");
  fire(se, "pointermove", { screenX: 540, screenY: 380 });
  fire(se, "pointerup", { screenX: 560, screenY: 380 });
  assert.deepEqual(sent, [
    { phase: "start", edge: "se", dx: 0, dy: 0 },
    { phase: "move", edge: "se", dx: 40, dy: -20 },
    { phase: "end", edge: "se", dx: 60, dy: -20 },
  ]);
  assert.equal(card.dataset.resizing, undefined);
});

test("moving the pointer without pressing reports nothing, and a double click resets", () => {
  const { sent, fire, handle } = setup();
  fire(handle("e"), "pointermove", { screenX: 10, screenY: 10 });
  assert.deepEqual(sent, []);
  fire(handle("e"), "dblclick");
  assert.deepEqual(sent, [{ phase: "reset" }]);
});
