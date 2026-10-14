import { mountBlink } from "../character/index.mjs";
import { menuActions } from "../menu/index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { createComposer } from "../composer/index.mjs";
const character = mountBlink(document.querySelector("#blink"));
window.glimpselet.interactive(character.regions());
// Stable module integration points; unfinished features do not fabricate results.
export const desktop = {
  character,
  menuActions,
  messages: createMessageStream(),
  composer: createComposer(),
};

// Capture owns the native selection; the conversation UI owns these attachments.
window.glimpselet.onEvent((event) => {
  if (event.type === "capture") desktop.composer.attach(event.capture.image);
});
document.querySelector("#blink").addEventListener("pointerdown", () => {
  void window.glimpselet.action("guide-dismiss");
});
// Blink intentionally has no keyboard focus. Native pointer events carry the
// held Shift modifier even while the underlying application keeps focus.
let shiftSelection = false;
const selectWithShift = (event) => {
  if (!event.shiftKey) shiftSelection = false;
  else if (
    !shiftSelection &&
    character
      .regions()
      .some(
        (region) =>
          event.clientX >= region.x &&
          event.clientX < region.x + region.width &&
          event.clientY >= region.y &&
          event.clientY < region.y + region.height,
      )
  ) {
    shiftSelection = true;
    void window.glimpselet.action("region").catch(() => {});
  }
};
for (const event of ["pointerenter", "pointermove"])
  document.querySelector("#blink").addEventListener(event, selectWithShift);
document.querySelector("#blink").addEventListener("pointerleave", () => {
  shiftSelection = false;
});
