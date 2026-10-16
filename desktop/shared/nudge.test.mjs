import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { attachNudge } from "./nudge.mjs";

function setup(current = { x: 0, y: 0 }) {
  const { window } = new JSDOM(
    "<header id=h><span id=brand>Blink</span><button id=b>x</button></header>",
  );
  const sent = [];
  const handle = window.document.querySelector("#h");
  attachNudge(handle, {
    send: (m) => sent.push(m),
    current: () => current,
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
  return { window, sent, handle, fire, doc: window.document };
}

test("dragging the header reports the new nudge, and letting go commits it", () => {
  const { sent, fire, doc, handle } = setup({ x: 10, y: -5 });
  fire(doc.querySelector("#brand"), "pointerdown", {
    screenX: 100,
    screenY: 100,
  });
  fire(handle, "pointermove", { screenX: 101, screenY: 100 });
  assert.deepEqual(sent, [], "a slip of a pixel is not a drag");
  fire(handle, "pointermove", { screenX: 70, screenY: 120 });
  assert.deepEqual(sent, [{ x: -20, y: 15 }]);
  assert.equal(handle.dataset.nudging, "true");
  fire(handle, "pointerup", { screenX: 60, screenY: 120 });
  assert.deepEqual(sent.at(-1), { x: -30, y: 15, commit: true });
  assert.equal(handle.dataset.nudging, undefined);
});
test("a click that never moved commits nothing, and the buttons do not drag", () => {
  const { sent, fire, doc, handle } = setup();
  fire(doc.querySelector("#brand"), "pointerdown", { screenX: 5, screenY: 5 });
  fire(handle, "pointerup", { screenX: 5, screenY: 5 });
  fire(doc.querySelector("#b"), "pointerdown", { screenX: 5, screenY: 5 });
  fire(handle, "pointermove", { screenX: 60, screenY: 60 });
  assert.deepEqual(sent, []);
});
test("a double click on the header resets, a double click on a button does not", () => {
  const { sent, fire, doc } = setup();
  fire(doc.querySelector("#b"), "dblclick");
  assert.deepEqual(sent, []);
  fire(doc.querySelector("#brand"), "dblclick");
  assert.deepEqual(sent, [{ reset: true }]);
});
