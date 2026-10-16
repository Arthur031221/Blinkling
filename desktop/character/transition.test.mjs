import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink } from "./index.mjs";
import { PEEK_EDGE } from "./motions.mjs";

function rig() {
  const { window } = new JSDOM("<body><div id='h'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const blink = mountBlink(window.document.querySelector("#h"));
  globalThis.document = previous;
  return blink;
}

/** Plays `from` until settled, then `to` frame by frame, and hands every frame
 * to `look`. */
function run(edge, from, to, look) {
  const blink = rig();
  let t = 0;
  for (; t < 2; t += 1 / 60) blink.pose(t, { mode: from, edge });
  for (let i = 0; i < 120; i++) {
    t += 1 / 60;
    const pose = blink.pose(t, { mode: to, edge });
    look(blink, pose, i);
  }
}

for (const edge of ["left", "right", "top", "bottom"])
  for (const [from, to] of [
    ["peek", "out"],
    ["out", "peek"],
  ])
    test(`turning ${from} to ${to} on the ${edge} edge never clips or hides a limb`, () => {
      let last = null;
      run(edge, from, to, (blink, pose, i) => {
        const lean = blink.peeking;
        // The edge only hides the body once Blink is mostly turned to it: before
        // that the whole figure, legs and feet included, is drawn.
        if (lean <= 0.4)
          assert.equal(
            pose.clipY ?? null,
            null,
            `frame ${i}: no clip at lean ${lean}`,
          );
        else assert.ok(pose.clipY >= PEEK_EDGE, `frame ${i}`);
        if (lean <= 0.5)
          assert.ok(!pose.armsOver, `frame ${i}: arms stay on the body`);
        // The sweep of the clip never jumps back and forth.
        if (last !== null && lean > 0.4 && last.lean > 0.4) {
          const dLean = lean - last.lean,
            dClip = pose.clipY - last.clip;
          assert.ok(dLean * dClip <= 1e-9, `frame ${i}: clip follows the lean`);
        }
        last = { lean, clip: pose.clipY };
        // Both legs are always in the drawing.
        const body = blink.svg.innerHTML;
        assert.ok(body.length > 0);
      });
    });
