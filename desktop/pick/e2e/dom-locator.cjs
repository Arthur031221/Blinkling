/** A Locator over one real Chromium page, for the end-to-end run until the
 * shared locator is merged: the element under a point, its parent, its text. */
const probe = (x, y) => {
  const KINDS = { P: "paragraph", IMG: "image", TABLE: "table", PRE: "code", MAIN: "section", BODY: "page" };
  const kindOf = (el) => el.dataset?.kind ?? KINDS[el.tagName] ?? null;
  const idOf = (el) => {
    const path = [];
    for (let n = el; n && n.parentElement; n = n.parentElement)
      path.unshift([...n.parentElement.children].indexOf(n));
    return `dom:${path.join(".") || "root"}`;
  };
  const describe = (el) => {
    const r = el.getBoundingClientRect();
    return {
      id: idOf(el),
      kind: kindOf(el),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      text: ["paragraph", "section", "table"].includes(kindOf(el)) ? el.innerText : "",
      secure: el.tagName === "INPUT" && el.type === "password",
    };
  };
  let el = document.elementFromPoint(x, y);
  while (el && !kindOf(el)) el = el.parentElement;
  if (!el) return null;
  const parent = (() => {
    let p = el.parentElement;
    while (p && !kindOf(p)) p = p.parentElement;
    return p;
  })();
  return { ...describe(el), parent: parent ? describe(parent) : null };
};

function createDomLocator(win, display) {
  const ref = {
    id: "w-fixture",
    title: win.getTitle(),
    app: "browser",
    bounds: win.getBounds(),
    private: false,
    passwordManager: false,
  };
  const toElement = (info) => {
    const c = win.getContentBounds();
    return {
      id: info.id,
      kind: info.kind,
      bounds: { x: info.rect.x + c.x, y: info.rect.y + c.y, width: info.rect.width, height: info.rect.height },
      role: info.kind,
      name: "",
      text: info.text,
      secure: info.secure,
      parentId: null,
      window: ref,
      display,
      source: "dom",
      parent: info.parent,
    };
  };
  const cache = new Map();
  const at = async (point) => {
    const c = win.getContentBounds();
    const x = point.x - c.x;
    const y = point.y - c.y;
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
    const info = await win.webContents.executeJavaScript(`(${probe})(${x}, ${y})`);
    if (!info) return null;
    const element = toElement(info);
    cache.set(element.id, element);
    return element;
  };
  return {
    locate: at,
    elements: async () => [...cache.values()],
    parent: async (id) => {
      const info = cache.get(id)?.parent;
      return info ? toElement({ ...info, parent: null }) : null;
    },
    selectionAt: async () => null,
    textIn: async (rect) => {
      const c = win.getContentBounds();
      const text = await win.webContents.executeJavaScript(
        `(${(r) => {
          const out = [];
          for (const p of document.querySelectorAll("[data-kind=paragraph]")) {
            const b = p.getBoundingClientRect();
            if (b.x < r.x + r.width && r.x < b.x + b.width && b.y < r.y + r.height && r.y < b.y + b.height) out.push(p.innerText);
          }
          return out.join("\\n");
        }})(${JSON.stringify({ x: rect.x - c.x, y: rect.y - c.y, width: rect.width, height: rect.height })})`,
      );
      return text ? { text, truncated: false } : null;
    },
    focus: async () => ({ secure: false, window: ref }),
  };
}

module.exports = { createDomLocator };
