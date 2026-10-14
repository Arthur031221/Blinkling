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
