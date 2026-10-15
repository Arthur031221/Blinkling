import assert from "node:assert/strict";
import test from "node:test";
import { createAxSource, parseTree } from "./ax.mjs";
import { axLinux } from "./ax-linux.mjs";
import { axMacos } from "./ax-macos.mjs";
import { axWindows } from "./ax-windows.mjs";

const window = {
  id: "w9",
  title: "Report",
  app: "evince",
  bounds: { x: 50, y: 40, width: 600, height: 500 },
  private: false,
  passwordManager: false,
};
const display = {
  id: "d",
  scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
};
const half = (p) => ({ x: p.x / 2, y: p.y / 2 });
const tree = (nodes) =>
  JSON.stringify({
    frame: { name: "Report", x: 100, y: 80, width: 1200, height: 1000 },
    nodes,
  });
const node = (over) => ({
  p: 0,
  role: "paragraph",
  name: "",
  text: "",
  x: 200,
  y: 200,
  w: 400,
  h: 60,
  secure: false,
  ...over,
});

test("native pixels become screen DIP through toDip, roles become kinds", () => {
  const out = parseTree(
    tree([
      node({
        p: -1,
        role: "frame",
        name: "Report",
        x: 100,
        y: 80,
        w: 1200,
        h: 1000,
      }),
      node({ text: "First paragraph." }),
      node({ role: "heading", name: "Title", x: 200, y: 100, w: 300, h: 40 }),
      node({
        role: "push button",
        name: "Save",
        x: 400,
        y: 600,
        w: 100,
        h: 40,
      }),
      node({ role: "table cell", text: "42", x: 300, y: 700, w: 80, h: 30 }),
    ]),
    { window, display, toDip: half },
  );
  const byKind = Object.fromEntries(out.elements.map((e) => [e.kind, e]));
  assert.deepEqual(byKind.paragraph.bounds, {
    x: 100,
    y: 100,
    width: 200,
    height: 30,
  });
  assert.equal(byKind.paragraph.text, "First paragraph.");
  assert.equal(byKind.heading.name, "Title");
  assert.equal(byKind.button.name, "Save");
  assert.equal(byKind.cell.text, "42");
  assert.equal(byKind.window.id, "ax:w9:0");
  assert.equal(byKind.paragraph.id, "ax:w9:1");
  assert.equal(out.parents.get(byKind.paragraph.id), byKind.window.id);
});

test("a password field is a bare marker and its text never survives parsing", () => {
  const out = parseTree(
    tree([
      node({ p: -1, role: "frame", x: 100, y: 80, w: 1200, h: 1000 }),
      node({
        role: "password text",
        name: "Password",
        text: "hunter2",
        secure: true,
      }),
      node({ role: "entry", name: "PIN", text: "1234", secure: true }),
    ]),
    { window, display, toDip: half },
  );
  const secure = out.elements.filter((e) => e.secure);
  assert.equal(secure.length, 2);
  for (const s of secure) {
    assert.equal(s.kind, "input");
    assert.equal(s.name, "");
    assert.equal(s.text, "");
  }
  assert.ok(!JSON.stringify(out).includes("hunter2"));
  assert.ok(!JSON.stringify(out).includes("1234"));
});

test("a role that is a password field is secure even when the helper did not say so", () => {
  const out = parseTree(
    tree([
      node({ p: -1, role: "frame", x: 100, y: 80, w: 1200, h: 1000 }),
      node({ role: "AXSecureTextField", text: "hunter2" }),
      node({ role: "Edit", text: "x", secure: false, isPassword: true }),
    ]),
    { window, display, toDip: half },
  );
  assert.equal(out.elements.filter((e) => e.secure).length, 2);
  assert.ok(!JSON.stringify(out).includes("hunter2"));
});

test("an empty or unusable tree falls through with null", () => {
  assert.equal(parseTree("", { window, display, toDip: half }), null);
  assert.equal(parseTree("not json", { window, display, toDip: half }), null);
  assert.equal(
    parseTree(JSON.stringify({ frame: null, nodes: [] }), {
      window,
      display,
      toDip: half,
    }),
    null,
  );
  assert.equal(
    parseTree(
      tree([node({ p: -1, role: "frame", x: 100, y: 80, w: 1200, h: 1000 })]),
      {
        window,
        display,
        toDip: half,
      },
    ),
    null,
  );
});

test("identity toDip keeps macOS points as they are", () => {
  const out = parseTree(
    tree([
      node({ p: -1, role: "AXWindow", x: 100, y: 80, w: 1200, h: 1000 }),
      node({ role: "AXStaticText", text: "Hi", x: 10, y: 20, w: 30, h: 40 }),
    ]),
    { window, display, toDip: (p) => p, roles: axMacos.roles },
  );
  const text = out.elements.find((e) => e.kind === "text");
  assert.deepEqual(text.bounds, { x: 10, y: 20, width: 30, height: 40 });
  assert.equal(out.elements.find((e) => e.kind === "window").role, "window");
});

test("each platform names its role vocabulary the same way for the kinds", () => {
  const cases = [
    [axLinux, "push button", "button"],
    [axLinux, "heading", "heading"],
    [axLinux, "document web", "page"],
    [axLinux, "image", "image"],
    [axMacos, "AXButton", "button"],
    [axMacos, "AXStaticText", "text"],
    [axMacos, "AXImage", "image"],
    [axMacos, "AXHeading", "heading"],
    [axMacos, "AXLink", "link"],
    [axMacos, "AXTable", "table"],
    [axMacos, "AXCell", "cell"],
    [axMacos, "AXTextField", "input"],
    [axWindows, "ControlType.Button", "button"],
    [axWindows, "ControlType.Text", "text"],
    [axWindows, "ControlType.Image", "image"],
    [axWindows, "ControlType.Hyperlink", "link"],
    [axWindows, "ControlType.DataItem", "cell"],
    [axWindows, "ControlType.Edit", "input"],
    [axWindows, "ControlType.Document", "page"],
  ];
  for (const [platform, role, kind] of cases) {
    const out = parseTree(
      tree([
        node({ p: -1, role: "frame", x: 100, y: 80, w: 1200, h: 1000 }),
        node({ role, name: "n", text: "t" }),
      ]),
      { window, display, toDip: half, roles: platform.roles },
    );
    assert.equal(out.elements[1].kind, kind, `${role} on ${platform.name}`);
  }
});

test("the source runs the platform helper with the window's centre in native pixels", async () => {
  const seen = [];
  const source = createAxSource({
    platform: {
      name: "fake",
      command: ({ x, y, title }) => ({
        file: "helper",
        args: [String(x), String(y), title],
      }),
      roles: {},
    },
    run: async (file, args, options) => {
      seen.push([file, args, options.timeout]);
      return tree([
        node({ p: -1, role: "frame", x: 100, y: 80, w: 1200, h: 1000 }),
        node({ text: "x" }),
      ]);
    },
    toDip: half,
    toNative: (p) => ({ x: p.x * 2, y: p.y * 2 }),
  });
  const result = await source.read({ window, display, point: { x: 1, y: 1 } });
  assert.equal(result.elements.length, 2);
  assert.deepEqual(seen[0].slice(0, 2), ["helper", ["700", "580", "Report"]]);
  assert.ok(seen[0][2] > 0);
});

test("a helper that fails, or prints nothing, falls through", async () => {
  const platform = {
    name: "fake",
    command: () => ({ file: "h", args: [] }),
    roles: {},
  };
  const common = { platform, toDip: half, toNative: (p) => p };
  assert.equal(
    await createAxSource({
      ...common,
      run: async () => Promise.reject(new Error("x")),
    }).read({
      window,
      display,
      point: { x: 1, y: 1 },
    }),
    null,
  );
  assert.equal(
    await createAxSource({ ...common, run: async () => "" }).read({
      window,
      display,
      point: { x: 1, y: 1 },
    }),
    null,
  );
});
