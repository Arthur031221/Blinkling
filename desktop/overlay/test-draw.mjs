import { createPointing } from "../pointing/index.mjs";
import {
  createOverlayFake,
  createPointingLocator,
} from "../pointing/test/locator.mjs";
import { guideRefs } from "./schema.mjs";
/** What the guide really puts on screen: its refs through the pointing engine. */
export async function drawGuide(guide, capture) {
  const overlay = createOverlayFake(),
    pointing = createPointing({ locator: createPointingLocator(), overlay });
  await pointing.show(guideRefs(guide), {
    displayId: capture.display.id,
    capture,
    snap: false,
  });
  pointing.clear("test");
  return overlay.shown.at(-1)?.drawings ?? [];
}
