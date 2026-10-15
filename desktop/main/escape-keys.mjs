import { escape, setLayer, topLayer } from "../shared/escape.mjs";
/** Wires shared/escape.mjs to a global Esc key. Overlay and mini composer own
 * a focused window and call `press` from it; guide and marks have none, so the
 * global key exists only while one of them is the top layer (N5.3). */
export function createEscapeKeys({ shortcuts }) {
  let registered = false;
  const sync = () => {
    const wanted = ["guide", "marks"].includes(topLayer());
    if (wanted === registered) return;
    registered = wanted;
    if (wanted) shortcuts.register("Escape", press);
    else shortcuts.unregister("Escape");
  };
  function press() {
    const closed = escape();
    sync();
    return closed;
  }
  return {
    set(name, close) {
      setLayer(name, close);
      sync();
    },
    press,
  };
}
