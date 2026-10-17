/** Eight handles around a card: a drag on an edge changes the width or the
 * height, a drag on a corner changes both. The window is sized in the main
 * process, so this only reports where the pointer is from where it began:
 * `send({phase: "start" | "move" | "end", edge, dx, dy})`, and
 * `send({phase: "reset"})` on a double click. */
export const HANDLES = Object.freeze([
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
]);
export function attachResize(card, { send, signal }) {
  const doc = card.ownerDocument;
  let drag = null;
  for (const edge of HANDLES) {
    const handle = doc.createElement("div");
    handle.className = "gl-resize";
    handle.dataset.edge = edge;
    handle.setAttribute("aria-hidden", "true");
    const listen = (type, fn) => handle.addEventListener(type, fn, { signal });
    const delta = (e) => ({ dx: e.screenX - drag.x, dy: e.screenY - drag.y });
    listen("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag = { id: e.pointerId, x: e.screenX, y: e.screenY };
      handle.setPointerCapture?.(e.pointerId);
      card.dataset.resizing = edge;
      send({ phase: "start", edge, dx: 0, dy: 0 });
    });
    listen("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      send({ phase: "move", edge, ...delta(e) });
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      send({ phase: "end", edge, ...delta(e) });
      drag = null;
      delete card.dataset.resizing;
    };
    listen("pointerup", end);
    listen("pointercancel", end);
    listen("dblclick", () => send({ phase: "reset" }));
    card.append(handle);
  }
}
