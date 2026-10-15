import test from "node:test";
import assert from "node:assert/strict";
import { createAxLinux } from "./sources/ax-linux.mjs";
import { createAxSource } from "./sources/ax-common.mjs";

const win = {
  id: "w9",
  app: "evince",
  title: "doc.pdf",
  pid: 42,
  bounds: { x: 0, y: 0, width: 500, height: 400 },
};
const displays = [
  { id: 1, scaleFactor: 2, bounds: { x: 0, y: 0, width: 960, height: 540 } },
];
const node = (i, p, role, bounds, over = {}) => ({
  i,
  p,
  role,
  secure: false,
  name: "",
  text: "",
  bounds,
  ...over,
});

test("tree nodes become raw elements in DIP with kinds from AT-SPI roles", async () => {
  const calls = [];
  const source = createAxLinux({
    request: async (cmd, payload) => {
      calls.push([cmd, payload]);
      return {
        found: true,
        nodes: [
          node(
            0,
            -1,
            "frame",
            { x: 0, y: 0, width: 1000, height: 800 },
            { name: "doc.pdf" },
          ),
          node(1, 0, "document frame", {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
          }),
          node(
            2,
            1,
            "page",
            { x: 120, y: 120, width: 400, height: 200 },
            { text: "Hello world." },
          ),
          node(
            3,
            1,
            "push button",
            { x: 600, y: 120, width: 80, height: 40 },
            { name: "Go" },
          ),
        ],
      };
    },
    displays: () => displays,
  });
  const result = await source.load(win, { displays });
  assert.equal(calls[0][0], "tree");
  assert.deepEqual(calls[0][1].bounds, {
    x: 0,
    y: 0,
    width: 1000,
    height: 800,
  });
  const byKey = Object.fromEntries(result.elements.map((e) => [e.key, e]));
  assert.deepEqual(byKey["2"].bounds, {
    x: 60,
    y: 60,
    width: 200,
    height: 100,
  });
  assert.equal(byKey["2"].text, "Hello world.");
  assert.equal(byKey["2"].parent, "1");
  assert.equal(byKey["1"].kind, "page");
  assert.equal(byKey["3"].kind, "button");
  assert.equal(byKey["0"].parent, null);
});

test("a window the tree cannot find, or a helper that fails, answers null", async () => {
  assert.equal(
    await createAxLinux({
      request: async () => ({ found: false, nodes: [] }),
      displays: () => displays,
    }).load(win, { displays }),
    null,
  );
  assert.equal(
    await createAxLinux({
      request: async () => {
        throw new Error("no bus");
      },
      displays: () => displays,
    }).load(win, { displays }),
    null,
  );
});

test("password fields never leave the source, even if the helper sent their text", async () => {
  const source = createAxLinux({
    request: async () => ({
      found: true,
      nodes: [
        node(0, -1, "frame", { x: 0, y: 0, width: 1000, height: 800 }),
        node(
          1,
          0,
          "password text",
          { x: 10, y: 10, width: 200, height: 30 },
          { secure: true, name: "Password", text: "hunter2" },
        ),
        node(
          2,
          0,
          "entry",
          { x: 10, y: 60, width: 200, height: 30 },
          { text: "a@b.c" },
        ),
      ],
    }),
    displays: () => displays,
  });
  const { elements } = await source.load(win, { displays });
  assert.deepEqual(
    elements.map((e) => e.key),
    ["0", "2"],
  );
  assert.ok(!JSON.stringify(elements).includes("hunter2"));
});

test("native pixels are divided by the scale of the display that holds them", async () => {
  const two = [
    {
      id: 1,
      scaleFactor: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    },
    {
      id: 2,
      scaleFactor: 2,
      bounds: { x: 1920, y: 0, width: 1280, height: 720 },
    },
  ];
  const source = createAxLinux({
    request: async () => ({
      found: true,
      nodes: [node(0, -1, "frame", { x: 3840, y: 0, width: 800, height: 400 })],
    }),
    displays: () => two,
  });
  const second = { ...win, bounds: { x: 1920, y: 0, width: 400, height: 200 } };
  const { elements } = await source.load(second, { displays: two });
  assert.deepEqual(elements[0].bounds, {
    x: 1920,
    y: 0,
    width: 400,
    height: 200,
  });
});

test("focus and selection pass through the helper", async () => {
  const source = createAxLinux({
    request: async (cmd) =>
      cmd === "focus"
        ? { found: true, secure: true, app: "evince", title: "doc.pdf" }
        : {
            found: true,
            text: "picked",
            bounds: { x: 20, y: 40, width: 100, height: 20 },
          },
    displays: () => displays,
  });
  assert.deepEqual(await source.focus({ displays }), {
    secure: true,
    app: "evince",
    title: "doc.pdf",
  });
  const sel = await source.selection(win, { displays });
  assert.equal(sel.text, "picked");
  assert.deepEqual(sel.bounds, { x: 10, y: 20, width: 50, height: 10 });
});

test("the platform picker returns a source only where one exists", () => {
  assert.equal(createAxSource({ platform: "freebsd" }), null);
  assert.equal(
    createAxSource({
      platform: "linux",
      request: async () => ({}),
      displays: () => [],
    }).name,
    "ax",
  );
});
