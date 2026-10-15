import { cropGeometry } from "./core.mjs";
import { browserOf, DRAG_THRESHOLD } from "./window-hit.mjs";

export { DRAG_THRESHOLD };

const refused = () => new Error("Invalid capture action");

/** What the overlay page asked for, checked against what the main process knows
 * about this capture. The page names a window by id and the box comes from the
 * list the main process made; only an area carries page geometry, and that is
 * checked against the frozen frame. */
export function validateChoice(choice, { capture, windows, companion }) {
  if (!choice || typeof choice !== "object") throw refused();
  const known = () => {
    const win = windows.find((w) => w.id === choice.id);
    if (!win) throw refused();
    return win;
  };
  switch (choice.kind) {
    case "area":
      cropGeometry(choice.rect, capture);
      return { kind: "area", rect: { ...choice.rect } };
    case "window": {
      const window = known();
      return { kind: "window", rect: { ...window.bounds }, window };
    }
    case "screen":
      return { kind: "screen" };
    case "page": {
      const window = known();
      if (!companion || !browserOf(window)) throw refused();
      return { kind: "page", rect: { ...window.bounds }, window };
    }
    default:
      throw refused();
  }
}
