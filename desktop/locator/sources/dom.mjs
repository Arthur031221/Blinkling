import { buildElement } from "../element.mjs";
import { kindOf } from "../kinds.mjs";

/** The first source: the page structure the companion extension reads from the
 * DOM. Rectangles come in viewport CSS pixels; screen DIP is
 * `css * zoom + screen origin`. Answers null whenever the companion has nothing
 * to say (no helper, a PDF, a restricted page), which sends the locator on to
 * OS accessibility. */
export function createDomSource({ companion, isBrowser = () => true } = {}) {
  return {
    name: "dom",
    handles: (window) => Boolean(companion) && isBrowser(window) === true,
    async read({ window, display, point, fresh, signal }) {
      if (!companion) return null;
      let result;
      try {
        result = await companion.elements({
          point,
          signal,
          ...(fresh ? { fresh: true } : {}),
        });
      } catch {
        return null;
      }
      if (!result || !Array.isArray(result.elements)) return null;
      const frame = result.frame ?? {};
      const zoom = Number(frame.zoom) > 0 ? Number(frame.zoom) : 1;
      const ox = Number(frame.screenX) || 0;
      const oy = Number(frame.screenY) || 0;
      // The companion answers for the browser's active tab, whichever window
      // that is; a page whose origin is outside this window belongs to another.
      const slack = 4;
      const b = window.bounds;
      if (
        ox < b.x - slack ||
        oy < b.y - slack ||
        ox > b.x + b.width + slack ||
        oy > b.y + b.height + slack
      )
        return null;
      const owner = result.page?.incognito
        ? { ...window, private: true }
        : window;
      const elements = [];
      const parents = new Map();
      const byId = new Map();
      // The page itself: its own bounds are the window's, the best the
      // companion's viewport-relative export lets us say.
      const root = buildElement({
        source: "dom",
        windowId: window.id,
        n: 0,
        bounds: window.bounds,
        role: "document",
        name: result.page?.title ?? window.title,
        kind: "page",
        window: owner,
        display,
      });
      elements.push(root);
      parents.set(root.id, null);
      let n = 1;
      for (const item of result.elements) {
        const rect = item.rect ?? {};
        const element = buildElement({
          source: "dom",
          windowId: window.id,
          n: n++,
          bounds: {
            x: (Number(rect.x) || 0) * zoom + ox,
            y: (Number(rect.y) || 0) * zoom + oy,
            width: (Number(rect.width) || 0) * zoom,
            height: (Number(rect.height) || 0) * zoom,
          },
          role: item.role,
          tag: item.tag,
          name: item.name,
          text: item.text,
          secure: item.secure === true,
          content: item.content,
          kind: item.secure === true ? undefined : kindOf(item),
          window: owner,
          display,
        });
        elements.push(element);
        byId.set(item.id, element.id);
        parents.set(element.id, item.parentId ?? null);
      }
      for (const [id, parentId] of parents)
        if (parentId !== null) parents.set(id, byId.get(parentId) ?? root.id);
        else parents.set(id, root.id === id ? null : root.id);
      const picked = result.selection;
      const selection =
        picked && typeof picked.text === "string" && picked.text && picked.rect
          ? buildElement({
              source: "dom",
              windowId: window.id,
              n: "selection",
              bounds: {
                x: (Number(picked.rect.x) || 0) * zoom + ox,
                y: (Number(picked.rect.y) || 0) * zoom + oy,
                width: (Number(picked.rect.width) || 0) * zoom,
                height: (Number(picked.rect.height) || 0) * zoom,
              },
              role: "selection",
              text: picked.text,
              kind: "text",
              window: owner,
              display,
            })
          : null;
      return {
        elements: elements.filter((e) => e.kind),
        parents,
        ...(selection ? { selection } : {}),
      };
    },
  };
}
