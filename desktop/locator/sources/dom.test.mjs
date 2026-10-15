import assert from "node:assert/strict";
import test from "node:test";
import { createDomSource } from "./dom.mjs";

const window = {
  id: "w1",
  title: "Docs",
  app: "chrome",
  bounds: { x: 100, y: 50, width: 1000, height: 800 },
  private: false,
  passwordManager: false,
};
const display = {
  id: "d1",
  scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
};
const page = {
  url: "https://example.test/",
  title: "Docs",
  tabId: 3,
  incognito: false,
};
const entry = (over) => ({
  id: "e1",
  kind: "text",
  tag: "p",
  rect: { x: 10, y: 20, width: 100, height: 40 },
  role: "paragraph",
  name: "",
  text: "Hello there.",
  parentId: null,
  secure: false,
  ...over,
});
const companionOf = (result, calls = []) => ({
  async elements(options) {
    calls.push(options);
    return result;
  },
});
const frame = { screenX: 100, screenY: 140, devicePixelRatio: 2, zoom: 1 };

test("maps companion rectangles to screen DIP with the page zoom", async () => {
  const source = createDomSource({
    companion: companionOf({
      page,
      frame: { ...frame, zoom: 1.5 },
      elements: [entry()],
    }),
  });
  const { elements } = await source.read({
    window,
    display,
    point: { x: 120, y: 200 },
  });
  const p = elements.find((e) => e.kind === "paragraph");
  assert.deepEqual(p.bounds, { x: 115, y: 170, width: 150, height: 60 });
  assert.equal(p.id, "dom:w1:1");
  assert.equal(p.text, "Hello there.");
  assert.equal(p.window, window);
  assert.equal(p.display, display);
});

test("adds the page itself as the outermost element", async () => {
  const source = createDomSource({
    companion: companionOf({ page, frame, elements: [entry()] }),
  });
  const { elements } = await source.read({
    window,
    display,
    point: { x: 1, y: 1 },
  });
  const root = elements.find((e) => e.kind === "page");
  assert.equal(root.name, "Docs");
  assert.deepEqual(root.bounds, window.bounds);
});

test("derives the kind from the role and tag, and keeps parents", async () => {
  const source = createDomSource({
    companion: companionOf({
      page,
      frame,
      elements: [
        entry({ id: "a", role: "heading", tag: "h1", kind: "heading" }),
        entry({ id: "b", parentId: "a", role: "img", tag: "canvas", text: "" }),
        entry({ id: "c", parentId: "a", role: "cell", tag: "td" }),
      ],
    }),
  });
  const { elements, parents } = await source.read({
    window,
    display,
    point: { x: 1, y: 1 },
  });
  const kinds = elements.map((e) => e.kind);
  assert.ok(kinds.includes("heading"));
  assert.ok(kinds.includes("canvas"));
  assert.ok(kinds.includes("cell"));
  const [a, b] = elements.filter((e) => e.id !== "dom:w1:0");
  assert.equal(parents.get(b.id), a.id);
});

test("a secure field comes back as a bare marker", async () => {
  const source = createDomSource({
    companion: companionOf({
      page,
      frame,
      elements: [
        entry({
          id: "pw",
          kind: "input",
          role: "textbox",
          tag: "input",
          name: "Password",
          text: "hunter2",
          secure: true,
          content: { markdown: "hunter2" },
        }),
      ],
    }),
  });
  const { elements } = await source.read({
    window,
    display,
    point: { x: 1, y: 1 },
  });
  const secure = elements.find((e) => e.secure);
  assert.equal(secure.kind, "input");
  assert.equal(secure.name, "");
  assert.equal(secure.text, "");
  assert.equal(secure.content, undefined);
  assert.ok(!JSON.stringify(elements).includes("hunter2"));
});

test("an incognito page marks the window private", async () => {
  const source = createDomSource({
    companion: companionOf({
      page: { ...page, incognito: true },
      frame,
      elements: [entry()],
    }),
  });
  const { elements } = await source.read({
    window,
    display,
    point: { x: 1, y: 1 },
  });
  assert.equal(elements[0].window.private, true);
  assert.equal(window.private, false);
});

test("carries content, caps text and passes point, fresh and signal on", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const source = createDomSource({
    companion: companionOf(
      {
        page,
        frame,
        elements: [
          entry({
            kind: "code",
            tag: "pre",
            role: "code",
            text: "x".repeat(6000),
            content: { code: "let a = 1", language: "js" },
          }),
        ],
      },
      calls,
    ),
  });
  const { elements } = await source.read({
    window,
    display,
    point: { x: 5, y: 6 },
    fresh: true,
    signal,
  });
  const code = elements.find((e) => e.kind === "code");
  assert.equal(code.text.length, 4000);
  assert.deepEqual(code.content, { code: "let a = 1", language: "js" });
  assert.deepEqual(calls, [{ point: { x: 5, y: 6 }, fresh: true, signal }]);
});

test("falls through (null) when the companion has no page to read", async () => {
  const source = createDomSource({ companion: companionOf(null) });
  assert.equal(
    await source.read({ window, display, point: { x: 1, y: 1 } }),
    null,
  );
});

test("falls through when there is no companion, or it fails", async () => {
  assert.equal(
    await createDomSource({ companion: null }).read({
      window,
      display,
      point: { x: 1, y: 1 },
    }),
    null,
  );
  const failing = { elements: async () => Promise.reject(new Error("down")) };
  assert.equal(
    await createDomSource({ companion: failing }).read({
      window,
      display,
      point: { x: 1, y: 1 },
    }),
    null,
  );
});

test("only browser windows are offered to the companion", () => {
  const source = createDomSource({
    companion: companionOf(null),
    isBrowser: (w) => w.app === "chrome",
  });
  assert.equal(source.handles(window), true);
  assert.equal(source.handles({ ...window, app: "gedit" }), false);
});

test("hands back the user's selection as a text element in screen DIP", async () => {
  const source = createDomSource({
    companion: companionOf({
      page,
      frame: { ...frame, zoom: 2 },
      elements: [entry()],
      selection: {
        text: "Chosen words",
        rect: { x: 5, y: 6, width: 70, height: 16 },
      },
    }),
  });
  const out = await source.read({ window, display, point: { x: 1, y: 1 } });
  assert.equal(out.selection.kind, "text");
  assert.equal(out.selection.text, "Chosen words");
  assert.deepEqual(out.selection.bounds, {
    x: 110,
    y: 152,
    width: 140,
    height: 32,
  });
  assert.ok(out.selection.id.startsWith("dom:w1:"));
});

test("a read without a selection has none", async () => {
  const source = createDomSource({
    companion: companionOf({ page, frame, elements: [entry()] }),
  });
  const out = await source.read({ window, display, point: { x: 1, y: 1 } });
  assert.equal(out.selection ?? null, null);
});

test("an answer from a page in another browser window is not this window's", async () => {
  const source = createDomSource({
    companion: companionOf({
      page,
      frame: { ...frame, screenX: 1500, screenY: 300 },
      elements: [entry()],
    }),
  });
  assert.equal(
    await source.read({ window, display, point: { x: 120, y: 160 } }),
    null,
  );
});
