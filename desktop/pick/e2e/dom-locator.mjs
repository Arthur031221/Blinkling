/** A locator over a real Chromium page, standing in for the window locator
 * service until it merges. It answers the same questions (locate, parent,
 * selectionAt, textIn, focus, windowAt, sentenceAt) from the page's own DOM,
 * so the e2e exercises real layout, real line boxes and a real selection.
 * Runs in the Electron main process; `win` is the fixture BrowserWindow. */
const PAGE = `(() => {
  if (window.__pick) return;
  const ids = new Map();
  let n = 0;
  const idOf = (el) => {
    if (!el.__pid) { el.__pid = "e" + ++n; ids.set(el.__pid, el); }
    return el.__pid;
  };
  const rect = (r) => ({ x: r.left, y: r.top, width: r.width, height: r.height });
  const kindOf = (el) => {
    const tag = el.tagName;
    if (tag === "IMG") return "image";
    if (tag === "TABLE") return "table";
    if (tag === "PRE") return "code";
    if (/^(P|H[1-6]|LI)$/.test(tag)) return "text";
    if (tag === "SECTION") return "section";
    if (tag === "INPUT") return "control";
    if (tag === "BODY") return "page";
    return null;
  };
  const lines = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const out = [];
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const last = out[out.length - 1];
      if (last && Math.abs(last.y - r.top) < 4) {
        const right = Math.max(last.x + last.width, r.right);
        last.x = Math.min(last.x, r.left);
        last.width = right - last.x;
      } else out.push(rect(r));
    }
    return out;
  };
  const describe = (el) => {
    const kind = kindOf(el);
    const d = { id: idOf(el), kind, bounds: rect(el.getBoundingClientRect()) };
    const parent = climb(el.parentElement);
    if (parent) d.parentId = idOf(parent);
    if (el.getAttribute("aria-label") || el.alt) d.name = el.getAttribute("aria-label") || el.alt;
    if (kind === "text") { d.text = el.innerText; d.lines = lines(el); }
    if (kind === "table")
      d.content = { rows: [...el.rows].map((r) => [...r.cells].map((c) => c.innerText)) };
    if (kind === "code") d.content = { code: { language: "js", text: el.innerText } };
    if (kind === "control" && el.type === "password") { d.role = "textbox"; d.secure = true; }
    return d;
  };
  const climb = (el) => { while (el && !kindOf(el)) el = el.parentElement; return el; };
  const sentenceBounds = (text, offset) => {
    let start = 0, end = text.length;
    const re = /[.!?]\\s+/g;
    let m;
    while ((m = re.exec(text))) {
      const cut = m.index + m[0].length;
      if (cut <= offset) start = cut;
      else { end = m.index + 1; break; }
    }
    return [start, end];
  };
  window.__pick = {
    at(x, y) {
      const el = climb(document.elementFromPoint(x, y));
      return el && el.tagName !== "BODY" ? describe(el) : null;
    },
    parent(id) {
      const el = climb(ids.get(id)?.parentElement);
      return el ? describe(el) : null;
    },
    page() { return describe(document.body); },
    textIn(r) {
      return [...document.querySelectorAll("p,h1,li")]
        .filter((e) => { const b = e.getBoundingClientRect(); return b.left >= r.x && b.top >= r.y && b.right <= r.x + r.width && b.bottom <= r.y + r.height; })
        .map((e) => e.innerText).join("\\n");
    },
    selection(x, y) {
      const s = getSelection();
      if (!s || s.isCollapsed) return null;
      const range = s.getRangeAt(0);
      const ls = [];
      for (const r of range.getClientRects()) if (r.width > 1) ls.push(rect(r));
      const b = rect(range.getBoundingClientRect());
      const inside = x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height;
      return inside ? { text: s.toString(), bounds: b, lines: ls } : null;
    },
    sentenceAt(id, x, y) {
      const el = ids.get(id);
      const caret = document.caretPositionFromPoint(x, y);
      if (!el || !caret || caret.offsetNode.nodeType !== 3) return null;
      const node = caret.offsetNode;
      const [a, b] = sentenceBounds(node.data, caret.offset);
      const range = document.createRange();
      range.setStart(node, a);
      range.setEnd(node, b);
      const ls = [];
      for (const r of range.getClientRects()) if (r.width > 1) ls.push(rect(r));
      const last = [];
      for (const l of ls) {
        const prev = last[last.length - 1];
        if (prev && Math.abs(prev.y - l.y) < 4) { prev.width = Math.max(prev.x + prev.width, l.x + l.width) - Math.min(prev.x, l.x); prev.x = Math.min(prev.x, l.x); }
        else last.push({ ...l });
      }
      return { text: node.data.slice(a, b).trim(), bounds: rect(range.getBoundingClientRect()), lines: last };
    },
    secureFocus() { const a = document.activeElement; return !!a && a.type === "password"; },
  };
})()`;

export function createDomLocator({ win, display, title = "Pick fixture" }) {
  const wc = win.webContents;
  const ready = wc.executeJavaScript(PAGE);
  const run = async (call) => (await ready, wc.executeJavaScript(call));
  const windowInfo = () => ({ id: `w${win.id}`, title, bounds: win.getContentBounds(), browser: true });
  const origin = () => win.getContentBounds();
  const toScreen = (r) => {
    const o = origin();
    return r && { x: r.x + o.x, y: r.y + o.y, width: r.width, height: r.height };
  };
  const fromScreen = (p) => ({ x: p.x - origin().x, y: p.y - origin().y });
  const lift = (d) =>
    d && {
      ...d,
      bounds: toScreen(d.bounds),
      lines: d.lines?.map(toScreen),
      window: windowInfo(),
      display,
    };
  const inside = (r, p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
  const calls = { locate: 0 };
  const byId = new Map();
  const remember = (d) => (d && byId.set(d.id, d), d);
  return {
    calls,
    async locate(point) {
      calls.locate++;
      const c = fromScreen(point);
      const { width, height } = origin();
      if (!inside({ x: 0, y: 0, width, height }, c)) return null;
      return remember(lift(await run(`window.__pick.at(${c.x}, ${c.y})`)));
    },
    async parent(el) {
      if (el.kind === "page") return null;
      const up = await run(`window.__pick.parent(${JSON.stringify(el.id)})`);
      return remember(lift(up ?? (await run("window.__pick.page()"))));
    },
    async selectionAt(point) {
      const c = fromScreen(point);
      const s = await run(`window.__pick.selection(${c.x}, ${c.y})`);
      return s && { text: s.text, bounds: toScreen(s.bounds), lines: s.lines.map(toScreen) };
    },
    async sentenceAt(el, point) {
      const c = fromScreen(point);
      const s = await run(`window.__pick.sentenceAt(${JSON.stringify(el.id)}, ${c.x}, ${c.y})`);
      return s && { text: s.text, bounds: toScreen(s.bounds), lines: s.lines.map(toScreen) };
    },
    async textIn(rect) {
      const o = origin();
      return run(`window.__pick.textIn(${JSON.stringify({ ...rect, x: rect.x - o.x, y: rect.y - o.y })})`);
    },
    async focus() {
      return { secure: await run("window.__pick.secureFocus()") };
    },
    async windowAt(point) {
      return inside(origin(), point) ? windowInfo() : null;
    },
  };
}

/** The browser's own PDF viewer exposes no DOM to a page script, so its text
 * comes the way a user gets it: the viewer's selection, copied. A page with
 * nothing selected has no text. */
export function createPdfLocator({ win, display, clipboard }) {
  const wc = win.webContents;
  const info = () => ({ id: `w${win.id}`, title: "PDF", bounds: win.getContentBounds(), browser: true, pdf: true });
  const inside = (r, p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
  return {
    async locate(point) {
      const bounds = win.getContentBounds();
      if (!inside(bounds, point)) return null;
      return { id: "pdf-page", kind: "page", bounds, window: info(), display };
    },
    async parent() { return null; },
    async selectionAt(point) {
      if (!inside(win.getContentBounds(), point)) return null;
      // The clipboard calls are asynchronous in this Electron.
      const before = await clipboard.readText();
      await clipboard.clear();
      wc.copy();
      await new Promise((r) => setTimeout(r, 120));
      const text = await clipboard.readText();
      if (before) await clipboard.writeText(before);
      else await clipboard.clear();
      return text.trim()
        ? { text: text.trim(), bounds: { x: point.x - 40, y: point.y - 10, width: 80, height: 20 }, lines: [{ x: point.x - 40, y: point.y - 10, width: 80, height: 20 }] }
        : null;
    },
    async textIn() { return ""; },
    async focus() { return { secure: false }; },
    async windowAt(point) { return inside(win.getContentBounds(), point) ? info() : null; },
  };
}
