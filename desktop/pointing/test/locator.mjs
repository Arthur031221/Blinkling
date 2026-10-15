import { EventEmitter } from "node:events";
import {
  DISPLAY,
  WINDOW,
  createLocatorStub,
  samplePage,
} from "../../pick/test/locator-stub.mjs";
export { DISPLAY, WINDOW, samplePage };

/** The pick stub plus the two methods pointing needs from the locator
 * contract: `elements(window)` and `snap(rect)`. `snap` answers with the
 * smallest element that contains most of the box, like the real locator. */
export function createPointingLocator({
  elements = samplePage(),
  snaps = true,
} = {}) {
  const stub = createLocatorStub({ elements });
  stub.list = elements;
  stub.calls.elements = 0;
  stub.elements = async () => {
    stub.calls.elements++;
    return stub.list;
  };
  if (snaps)
    stub.snap = async (rect) => {
      const area = (r) => r.width * r.height;
      const hit = stub.list
        .filter((e) => e.kind !== "page" && e.kind !== "section")
        .filter((e) => {
          const b = e.bounds;
          const w =
            Math.min(rect.x + rect.width, b.x + b.width) -
            Math.max(rect.x, b.x);
          const h =
            Math.min(rect.y + rect.height, b.y + b.height) -
            Math.max(rect.y, b.y);
          return w > 0 && h > 0 && (w * h) / area(rect) >= 0.6;
        })
        .sort((a, b) => area(a.bounds) - area(b.bounds))[0];
      return hit ? { bounds: hit.bounds, element: hit } : null;
    };
  return stub;
}

/** An overlay service that records what pointing asks of it. */
export function createOverlayFake() {
  const overlay = Object.assign(new EventEmitter(), {
    shown: [],
    commands: [],
    dismissed: [],
    interactive: [],
    displays: { getAllDisplays: () => [{ ...DISPLAY, id: 1 }] },
    async show(capture, drawings) {
      overlay.capture = capture;
      overlay.drawings = drawings;
      overlay.shown.push({ capture, drawings });
      return true;
    },
    command(name, arg) {
      overlay.commands.push([name, arg]);
    },
    setInteractive(on) {
      overlay.interactive.push(on);
    },
    dismiss(reason = "user") {
      if (!overlay.capture) return;
      overlay.capture = null;
      overlay.dismissed.push(reason);
      overlay.emit("dismissed", reason);
    },
  });
  return overlay;
}
