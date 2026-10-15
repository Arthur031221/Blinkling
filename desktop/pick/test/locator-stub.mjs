/** A stand-in for m-locator's Locator until it is merged: a fixed list of
 * elements, hit-tested smallest-first, with the window as the fallback. */
const contains = (b, p) =>
  p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
const area = (e) => e.bounds.width * e.bounds.height;

export function createLocatorStub({ elements = [], selection = null, focus } = {}) {
  const calls = { locate: 0, textIn: 0, parent: 0 };
  const byId = new Map(elements.map((e) => [e.id, e]));
  return {
    calls,
    async locate(point) {
      calls.locate++;
      return (
        elements
          .filter((e) => contains(e.bounds, point))
          .sort((a, b) => area(a) - area(b))[0] ?? null
      );
    },
    async elements() {
      return elements;
    },
    async parent(id) {
      calls.parent++;
      const parentId = byId.get(id)?.parentId;
      return (parentId && byId.get(parentId)) || null;
    },
    async selectionAt(point) {
      return selection && contains(selection.bounds, point) ? selection : null;
    },
    async textIn(rect) {
      calls.textIn++;
      const text = elements
        .filter((e) => !e.secure && e.text && contains(rect, { x: e.bounds.x, y: e.bounds.y }))
        .map((e) => e.text)
        .join("\n");
      return text ? { text, truncated: false } : null;
    },
    async focus() {
      return focus ?? { secure: false, window: null };
    },
  };
}

export const display = { id: "1", scaleFactor: 1, bounds: { x: 0, y: 0, width: 1280, height: 800 } };
export const windowRef = { id: "w1", title: "Page", app: "browser", bounds: display.bounds, private: false, passwordManager: false };

export const element = (id, kind, bounds, extra = {}) => ({
  id,
  kind,
  bounds,
  role: kind,
  name: "",
  text: "",
  secure: false,
  parentId: null,
  window: windowRef,
  display,
  source: "dom",
  ...extra,
});
