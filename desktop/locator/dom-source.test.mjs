import test from "node:test";
import assert from "node:assert/strict";
import { createDomSource } from "./sources/dom.mjs";

const chrome = {
  id: "w1",
  app: "chrome",
  title: "Doc - Google Chrome",
  bounds: { x: 100, y: 200, width: 800, height: 600 },
};
const page = (over = {}) => ({
  page: {
    url: "https://example.test/",
    title: "Doc",
    tabId: 3,
    incognito: false,
  },
  frame: { screenX: 100, screenY: 200, devicePixelRatio: 2, zoom: 1.5 },
  elements: [
    {
      id: "e1",
      kind: "heading",
      tag: "h1",
      rect: { x: 10, y: 20, width: 100, height: 40 },
      role: "heading",
      name: "Title",
      text: "Title",
      parentId: null,
      secure: false,
    },
    {
      id: "e2",
      kind: "image",
      tag: "canvas",
      rect: { x: 0, y: 100, width: 80, height: 60 },
      role: "img",
      name: "",
      text: "",
      parentId: "e1",
      secure: false,
    },
    {
      id: "e3",
      kind: "input",
      tag: "input",
      rect: { x: 0, y: 200, width: 80, height: 20 },
      role: "textbox",
      name: "Password",
      text: "",
      parentId: null,
      secure: true,
    },
    {
      id: "e4",
      kind: "math",
      tag: "math",
      rect: { x: 0, y: 300, width: 50, height: 20 },
      role: "math",
      name: "",
      text: "x",
      parentId: null,
      secure: false,
      content: { latex: "x^2" },
    },
  ],
  ...over,
});

test("applies only to a browser window while the companion is connected", async () => {
  let connected = true;
  const source = createDomSource({
    host: { elements: async () => page() },
    companion: () => connected,
  });
  assert.equal(await source.applies(chrome), true);
  assert.equal(
    await source.applies({ ...chrome, app: "evince", title: "a.pdf" }),
    false,
  );
  connected = false;
  assert.equal(await source.applies(chrome), false);
  assert.equal(
    await createDomSource({ host: null, companion: () => true }).applies(
      chrome,
    ),
    false,
  );
});

test("viewport CSS px become screen DIP through screenX, screenY and zoom", async () => {
  const seen = [];
  const source = createDomSource({
    host: { elements: async (q) => (seen.push(q.point), page()) },
    companion: () => true,
  });
  const result = await source.load(chrome, { point: { x: 300, y: 400 } });
  assert.deepEqual(seen, [{ x: 300, y: 400 }]);
  const [h1] = result.elements;
  assert.deepEqual(h1.bounds, { x: 115, y: 230, width: 150, height: 60 });
  assert.equal(h1.kind, "heading");
  assert.equal(h1.name, "Title");
  assert.equal(h1.key, "e1");
});

test("kinds come from tag and role, parents from parentId, content passes through", async () => {
  const source = createDomSource({
    host: { elements: async () => page() },
    companion: () => true,
  });
  const { elements } = await source.load(chrome, { point: { x: 1, y: 1 } });
  assert.equal(elements.find((e) => e.key === "e2").kind, "canvas");
  assert.equal(elements.find((e) => e.key === "e2").parent, "e1");
  assert.deepEqual(elements.find((e) => e.key === "e4").content, {
    latex: "x^2",
  });
  assert.equal(elements.find((e) => e.key === "e4").kind, "formula");
});

test("secure fields are dropped before they leave the source", async () => {
  const source = createDomSource({
    host: { elements: async () => page() },
    companion: () => true,
  });
  const { elements } = await source.load(chrome, { point: { x: 1, y: 1 } });
  assert.ok(!elements.some((e) => e.key === "e3"));
  assert.ok(!JSON.stringify(elements).includes("Password"));
});

test("an incognito page marks the result private", async () => {
  const source = createDomSource({
    host: {
      elements: async () =>
        page({ page: { url: "u", title: "t", tabId: 1, incognito: true } }),
    },
    companion: () => true,
  });
  assert.equal(
    (await source.load(chrome, { point: { x: 1, y: 1 } })).private,
    true,
  );
});

test("no page, a throwing host or junk answers null; the point defaults to the window centre", async () => {
  assert.equal(
    await createDomSource({
      host: { elements: async () => null },
      companion: () => true,
    }).load(chrome, {}),
    null,
  );
  assert.equal(
    await createDomSource({
      host: {
        elements: async () => {
          throw new Error("x");
        },
      },
      companion: () => true,
    }).load(chrome, {}),
    null,
  );
  assert.equal(
    await createDomSource({
      host: { elements: async () => ({ junk: 1 }) },
      companion: () => true,
    }).load(chrome, {}),
    null,
  );
  const seen = [];
  await createDomSource({
    host: { elements: async (q) => (seen.push(q.point), null) },
    companion: () => true,
  }).load(chrome, {});
  assert.deepEqual(seen, [{ x: 500, y: 500 }]);
});
