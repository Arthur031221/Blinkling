import { extractReferences } from "./render.mjs";

const BOX =
  /^box:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/;

/** The key a bubble badge carries in `data-ref`; hovering it names this mark. */
export const refKey = ({ elementId, rect }) =>
  elementId ?? `box:${rect.x},${rect.y},${rect.width},${rect.height}`;

/** Every `[[n:target|label]]` an answer wrote, as `{n, ref, label}` plus either
 * `elementId` (the locator's id, tried first) or `rect` (a pixel box on the
 * screenshot, the fallback). A number keeps its first target; a reference that
 * names nothing usable is dropped. */
export function parseRefs(text) {
  if (typeof text !== "string") return [];
  const refs = new Map();
  for (const { n, ref, label } of extractReferences(text).references) {
    if (refs.has(n) || !ref) continue;
    const box = BOX.exec(ref);
    if (ref.startsWith("box:")) {
      if (!box) continue;
      const [x, y, width, height] = box.slice(1).map(Number);
      if (width <= 0 || height <= 0) continue;
      refs.set(n, { n, ref, rect: { x, y, width, height }, label });
    } else refs.set(n, { n, ref, elementId: ref, label });
  }
  return [...refs.values()].sort((a, b) => a.n - b.n);
}
