// Source 1: the page structure the browser helper (extension) exports.
import { browserOf } from "../../capture/window-hit.mjs";
import { kindOfDom } from "../kinds.mjs";

const finite = (rect) =>
  !!rect &&
  ["x", "y", "width", "height"].every((k) => Number.isFinite(rect[k]));

const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

export function createDomSource({ host, companion }) {
  return {
    name: "dom",
    async applies(win) {
      if (typeof host?.elements !== "function" || !browserOf(win)) return false;
      try {
        return (await companion?.()) === true;
      } catch {
        return false;
      }
    },
    // -> { elements: Raw[], private } | null
    async load(win, { point, signal } = {}) {
      let page;
      try {
        page = await host.elements({
          point: point ?? centre(win.bounds),
          signal,
        });
      } catch {
        return null;
      }
      if (!page || !Array.isArray(page.elements) || !page.frame) return null;
      const { screenX, screenY, zoom } = page.frame;
      if (![screenX, screenY, zoom].every(Number.isFinite)) return null;
      const elements = [];
      for (const e of page.elements) {
        if (e.secure === true || !finite(e.rect)) continue;
        const rect = {
          x: screenX + e.rect.x * zoom,
          y: screenY + e.rect.y * zoom,
          width: e.rect.width * zoom,
          height: e.rect.height * zoom,
        };
        elements.push({
          key: String(e.id),
          parent: e.parentId == null ? null : String(e.parentId),
          kind: kindOfDom({ ...e, rect: e.rect }),
          bounds: rect,
          role: e.role ?? "",
          name: e.name ?? "",
          text: e.text ?? "",
          secure: false,
          ...(e.content ? { content: e.content } : {}),
        });
      }
      return { elements, private: page.page?.incognito === true };
    },
  };
}
