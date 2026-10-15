/** Stand-in for the m-locator service until the branches merge. It answers the
 * questions the pick layer asks, over a fixed element list, with the same
 * shapes: locate, parent, selectionAt, textIn, focus, windowAt (and the optional
 * sentenceAt for locators that can reach below a paragraph). */
export const DISPLAY = Object.freeze({
  id: "1",
  bounds: Object.freeze({ x: 0, y: 0, width: 1280, height: 800 }),
  scaleFactor: 1,
});
export const WINDOW = Object.freeze({
  id: "w1",
  title: "Example",
  bounds: Object.freeze({ x: 100, y: 60, width: 900, height: 640 }),
});
const inside = (r, p) =>
  p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
const area = (r) => r.width * r.height;

export function element(id, kind, bounds, extra = {}) {
  return { id, kind, bounds, window: WINDOW, display: DISPLAY, ...extra };
}

/** A small page: title bar, a section holding a paragraph with two sentences,
 * an image, a table, a code block and a password field. */
export function samplePage() {
  const page = element("page", "page", { x: 100, y: 90, width: 900, height: 610 }, {
    name: "Example page",
  });
  const section = element(
    "section-1",
    "section",
    { x: 120, y: 110, width: 600, height: 280 },
    { parentId: "page", name: "Background" },
  );
  const paragraph = element(
    "para-1",
    "text",
    { x: 140, y: 150, width: 560, height: 60 },
    {
      parentId: "section-1",
      text: "Blink looks at your screen. It never clicks anything.",
      lines: [
        { x: 140, y: 150, width: 560, height: 20 },
        { x: 140, y: 170, width: 300, height: 20 },
      ],
      sentences: [
        {
          text: "Blink looks at your screen.",
          bounds: { x: 140, y: 150, width: 330, height: 20 },
          lines: [{ x: 140, y: 150, width: 330, height: 20 }],
        },
        {
          text: "It never clicks anything.",
          bounds: { x: 140, y: 170, width: 300, height: 20 },
          lines: [{ x: 140, y: 170, width: 300, height: 20 }],
        },
      ],
    },
  );
  const image = element(
    "img-1",
    "image",
    { x: 140, y: 230, width: 200, height: 120 },
    { parentId: "section-1", name: "Photo of a lake" },
  );
  const table = element(
    "table-1",
    "table",
    { x: 360, y: 230, width: 320, height: 120 },
    {
      parentId: "section-1",
      content: {
        rows: [
          ["Item", "Price"],
          ["Tea", "3"],
          ["Cake", "5"],
        ],
      },
    },
  );
  const code = element(
    "code-1",
    "code",
    { x: 140, y: 410, width: 420, height: 80 },
    {
      parentId: "page",
      content: { code: { language: "js", text: "const a = 1;\nconsole.log(a);" } },
    },
  );
  const password = element(
    "pw-1",
    "control",
    { x: 140, y: 520, width: 220, height: 32 },
    { parentId: "page", role: "textbox", secure: true, name: "Password" },
  );
  const titlebar = element(
    "title-1",
    "titlebar",
    { x: 100, y: 60, width: 900, height: 30 },
    {},
  );
  return [titlebar, page, section, paragraph, image, table, code, password];
}

export function createLocatorStub({
  elements = samplePage(),
  selection = null,
  focus = { secure: false },
  sentences = true,
} = {}) {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const calls = { locate: 0, parent: 0 };
  const stub = {
    calls,
    async locate(point) {
      calls.locate++;
      const hits = elements.filter((e) => inside(e.bounds, point));
      hits.sort((a, b) => area(a.bounds) - area(b.bounds));
      return hits[0] ?? null;
    },
    async parent(el) {
      calls.parent++;
      return el.parentId ? (byId.get(el.parentId) ?? null) : null;
    },
    async selectionAt(point) {
      return selection && inside(selection.bounds, point) ? selection : null;
    },
    async textIn(rect) {
      return elements
        .filter((e) => e.text && inside(rect, e.bounds))
        .map((e) => e.text)
        .join("\n");
    },
    async focus() {
      return focus;
    },
    /** The window under a point, for clicks that land on no element. */
    async windowAt(point) {
      return elements.find((e) => e.window && inside(e.window.bounds, point))?.window ?? null;
    },
  };
  if (sentences)
    stub.sentenceAt = async (el, point) =>
      el.sentences?.find((s) => s.lines.some((l) => inside(l, point))) ?? null;
  return stub;
}
