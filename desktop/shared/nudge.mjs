/** Dragging a card or panel by its header moves it a little way from where it
 * opens; a double click puts it back. The window moves in the main process, so
 * this only reports where the reader wants it: `send({x, y})` while the pointer
 * moves, `send({x, y, commit: true})` when it lets go and `send({reset: true})`
 * on a double click. `current()` is the nudge the surface has now. */
export const DRAG_SLOP = 3;
export function attachNudge(
  handle,
  { send, current, signal, ignore = "button, a, input, textarea, select" },
) {
  let drag = null;
  const listen = (type, fn) => handle.addEventListener(type, fn, { signal });
  listen("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest?.(ignore)) return;
    const base = current() ?? { x: 0, y: 0 };
    drag = { id: e.pointerId, x: e.screenX, y: e.screenY, base, moved: false };
    handle.setPointerCapture?.(e.pointerId);
  });
  const offset = (e) => ({
    x: drag.base.x + e.screenX - drag.x,
    y: drag.base.y + e.screenY - drag.y,
  });
  listen("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (
      !drag.moved &&
      Math.hypot(e.screenX - drag.x, e.screenY - drag.y) < DRAG_SLOP
    )
      return;
    drag.moved = true;
    handle.dataset.nudging = "true";
    send(offset(e));
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) send({ ...offset(e), commit: true });
    drag = null;
    delete handle.dataset.nudging;
  };
  listen("pointerup", end);
  listen("pointercancel", end);
  listen("dblclick", (e) => {
    if (e.target.closest?.(ignore)) return;
    send({ reset: true });
  });
}
