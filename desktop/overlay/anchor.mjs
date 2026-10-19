/** How often the page is asked where it is scrolled to. */
export const ANCHOR_POLL_MS = 300;
const ok = (frame) =>
  !!frame &&
  ["screenX", "screenY", "zoom", "scrollX", "scrollY"].every((k) =>
    Number.isFinite(frame[k]),
  ) &&
  frame.zoom > 0;

/** Keeps a guide's marks on the page text they were drawn on. Each mark is
 * saved in page (document) coordinates when the guide is drawn; while the page
 * scrolls or its window is resized, `onShift` gets how far each mark is from
 * where it was drawn and whether any of it is still in view.
 *
 * `host.elements({point})` is the browser helper; `point` is a screen point
 * that lies in the browser window. Without the helper (or when the page cannot
 * be read) `attach` resolves false and the marks stay where the screen had
 * them. */
export function createAnchor({
  host,
  onShift,
  onLost = () => {},
  available = async () => true,
  poll = ANCHOR_POLL_MS,
  setTimer = setInterval,
  clearTimer = clearInterval,
}) {
  let marks = [];
  let origin = null;
  let point = null;
  let timer = null;
  let busy = false;
  let sent = new Map();
  let url = null;

  const read = async () => {
    try {
      const page = await host?.elements?.({ point });
      if (!ok(page?.frame)) return null;
      return Object.assign({}, page.frame, { url: page.page?.url ?? null });
    } catch {
      return null;
    }
  };
  const view = (frame) => ({
    x: frame.screenX,
    y: frame.screenY,
    width: (frame.viewWidth || 0) * frame.zoom,
    height: (frame.viewHeight || 0) * frame.zoom,
  });
  const inside = (box, r) =>
    r.x + r.width > box.x &&
    r.y + r.height > box.y &&
    r.x < box.x + box.width &&
    r.y < box.y + box.height;
  const toDocument = (rect, frame) => ({
    x: (rect.x - frame.screenX) / frame.zoom + frame.scrollX,
    y: (rect.y - frame.screenY) / frame.zoom + frame.scrollY,
    width: rect.width / frame.zoom,
    height: rect.height / frame.zoom,
  });
  const toScreen = (doc, frame) => ({
    x: frame.screenX + (doc.x - frame.scrollX) * frame.zoom,
    y: frame.screenY + (doc.y - frame.scrollY) * frame.zoom,
    width: doc.width * frame.zoom,
    height: doc.height * frame.zoom,
  });

  function place(frame) {
    const box = view(frame);
    const moves = [];
    for (const mark of marks) {
      const now = toScreen(mark.doc, frame);
      const dx = Math.round(now.x - mark.screen.x);
      const dy = Math.round(now.y - mark.screen.y);
      const visible = !box.width || inside(box, now);
      const before = sent.get(mark.n);
      if (
        before &&
        before.dx === dx &&
        before.dy === dy &&
        before.visible === visible
      )
        continue;
      sent.set(mark.n, { dx, dy, visible });
      moves.push({ n: mark.n, dx, dy, visible });
    }
    if (moves.length) onShift(moves);
  }

  async function tick() {
    if (busy || !marks.length) return;
    busy = true;
    try {
      const frame = await read();
      if (!frame || !marks.length) return;
      // Another page in the tab: the marks are about the one that was read.
      if (url && frame.url && frame.url !== url) {
        api.detach();
        onLost("content-changed");
        return;
      }
      place(frame);
    } finally {
      busy = false;
    }
  }

  const api = {
    /** `rects`: [{n, x, y, width, height}] in screen DIP, as drawn. True when
     * the page is readable and at least one mark lies on it. */
    async attach(rects) {
      api.detach();
      if (!rects.length) return false;
      const first = rects[0];
      point = {
        x: first.x + first.width / 2,
        y: first.y + first.height / 2,
      };
      if (!(await available().catch(() => false))) return false;
      const frame = await read();
      if (!frame) return false;
      url = frame.url;
      const box = view(frame);
      marks = rects
        .filter((r) => !box.width || inside(box, r))
        .map((r) => ({ n: r.n, screen: r, doc: toDocument(r, frame) }));
      origin = frame;
      if (!marks.length) return false;
      timer = setTimer(tick, poll);
      timer.unref?.();
      return true;
    },
    /** The page scroll that brings mark `n` to the middle of the window, as
     * `{x, y}` in page CSS pixels, or null when the mark is not anchored. */
    scrollFor(n, frame = origin) {
      const mark = marks.find((m) => m.n === n);
      if (!mark || !frame) return null;
      const height = frame.viewHeight || 0 || 0;
      const top = mark.doc.y + mark.doc.height / 2 - height / 2;
      return { y: Math.max(0, Math.round(top)) };
    },
    /** Scrolls the page so mark `n` is in view, like following a link. */
    async reveal(n) {
      const to = api.scrollFor(n);
      if (!to || !point) return false;
      const done = await host
        .scrollPage?.({ point, ...to })
        .catch(() => ({ ok: false }));
      await tick();
      return done?.ok === true;
    },
    has: (n) => marks.some((m) => m.n === n),
    get active() {
      return marks.length > 0;
    },
    tick,
    detach() {
      if (timer) clearTimer(timer);
      timer = null;
      marks = [];
      sent = new Map();
      origin = null;
      point = null;
      url = null;
    },
  };
  return api;
}
