/** Esc closes only the topmost thing (N5.3): the capture overlay, then the
 * mini composer, then guide mode, then the marks. Main process only. */
export const LAYERS = Object.freeze(["overlay", "mini", "guide", "marks"]);
const open = new Map();

export function setLayer(name, close) {
  if (!LAYERS.includes(name)) throw new Error(`Unknown layer: ${name}`);
  if (close) open.set(name, close);
  else open.delete(name);
}

export function topLayer() {
  return LAYERS.find((name) => open.has(name)) ?? null;
}

export function escape() {
  const name = topLayer();
  if (!name) return null;
  const close = open.get(name);
  open.delete(name);
  close();
  return name;
}
