import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectX11,
  fitWindows,
  listWindows,
  parseMacWindows,
  parseWindowsWindows,
  MAC_SCRIPT,
  WINDOWS_SCRIPT,
} from "./window-list.mjs";

/** A small X tree: children of the root are frames, bottom to top. */
function fakeX11(tree) {
  return {
    async children(id) {
      return tree[id]?.children ?? [];
    },
    async attributes(id) {
      return (
        tree[id]?.attributes ?? { viewable: true, overrideRedirect: false }
      );
    },
    async geometry(id) {
      return tree[id].geometry;
    },
    async property(id, name) {
      return tree[id]?.props?.[name] ?? null;
    },
  };
}
const geometry = (x, y, width, height) => ({ x, y, width, height });
const tree = {
  root: { children: ["desktop", "frameA", "frameB", "menu", "hidden", "ours"] },
  desktop: {
    geometry: geometry(0, 0, 1280, 800),
    props: { _NET_WM_WINDOW_TYPE: ["_NET_WM_WINDOW_TYPE_DESKTOP"] },
  },
  frameA: { geometry: geometry(40, 30, 600, 400), children: ["clientA"] },
  clientA: {
    props: {
      WM_CLASS: "mousepad\0Mousepad\0",
      _NET_WM_NAME: "notes.txt - Mousepad",
      _NET_WM_PID: 11,
    },
  },
  frameB: { geometry: geometry(300, 200, 700, 500), children: ["wrapper"] },
  wrapper: { children: ["clientB"] },
  clientB: {
    props: {
      WM_CLASS: "google-chrome\0Google-chrome\0",
      WM_NAME: "Inbox - Google Chrome",
      _NET_WM_PID: 22,
    },
  },
  menu: {
    geometry: geometry(10, 10, 100, 100),
    attributes: { viewable: true, overrideRedirect: true },
  },
  hidden: {
    geometry: geometry(0, 0, 300, 300),
    attributes: { viewable: false, overrideRedirect: false },
    children: ["clientH"],
  },
  clientH: { props: { WM_CLASS: "x\0X\0" } },
  ours: { geometry: geometry(500, 400, 300, 200), children: ["clientOurs"] },
  clientOurs: { props: { WM_CLASS: "blinkling\0Blinkling\0" } },
};

test("X11 windows come back front to back with app, class, title and pid", async () => {
  const found = await collectX11(fakeX11(tree), {
    ids: new Set(["clientOurs"]),
  });
  assert.deepEqual(
    found.map((w) => [w.id, w.appClass, w.title, w.pid]),
    [
      ["frameB", "Google-chrome", "Inbox - Google Chrome", 22],
      ["frameA", "Mousepad", "notes.txt - Mousepad", 11],
    ],
  );
  assert.deepEqual(found[1].bounds, geometry(40, 30, 600, 400));
});

test("desktop windows, menus, unmapped frames and our own windows are skipped", async () => {
  const ids = (
    await collectX11(fakeX11(tree), { ids: new Set(["clientOurs"]) })
  ).map((w) => w.id);
  for (const skipped of ["desktop", "menu", "hidden", "ours"])
    assert.ok(!ids.includes(skipped), skipped);
});

test("a window that belongs to our own process is skipped by pid", async () => {
  const found = await collectX11(fakeX11(tree), {
    ids: new Set(),
    pids: new Set([22]),
  });
  assert.deepEqual(
    found.map((w) => w.id),
    ["ours", "frameA"],
  );
});

test("a window whose frame is our own frame id is skipped too", async () => {
  const found = await collectX11(fakeX11(tree), { ids: new Set(["frameA"]) });
  assert.ok(!found.some((w) => w.id === "frameA"));
});

test("a window that vanishes while it is read is skipped, not fatal", async () => {
  const api = fakeX11(tree);
  const geometryOf = api.geometry;
  api.geometry = async (id) => {
    if (id === "frameA") throw new Error("BadWindow");
    return geometryOf(id);
  };
  const found = await collectX11(api, { ids: new Set(["clientOurs"]) });
  assert.deepEqual(
    found.map((w) => w.id),
    ["frameB"],
  );
});

const display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 800, height: 600 },
};
const identity = (point) => point;

test("windows become display-relative DIP boxes clipped to the display", () => {
  const fitted = fitWindows(
    [
      { id: "a", bounds: geometry(-100, 50, 400, 300), app: "A" },
      { id: "b", bounds: geometry(700, 500, 400, 400), app: "B" },
      { id: "far", bounds: geometry(2000, 0, 300, 300) },
    ],
    display,
    identity,
  );
  assert.deepEqual(
    fitted.map((w) => [w.id, w.bounds]),
    [
      ["a", geometry(0, 50, 300, 300)],
      ["b", geometry(700, 500, 100, 100)],
    ],
  );
});

test("scale factors and a second display's origin are applied", () => {
  const second = { id: 2, bounds: { x: 1000, y: 0, width: 640, height: 400 } };
  const toDip = (point) => ({ x: point.x / 2, y: point.y / 2 });
  const fitted = fitWindows(
    [{ id: "a", bounds: geometry(2400, 200, 600, 400) }],
    second,
    toDip,
  );
  assert.deepEqual(fitted[0].bounds, geometry(200, 100, 300, 200));
});

test("slivers and tiny windows are dropped, and the list is capped", () => {
  const raw = [
    { id: "sliver", bounds: geometry(790, 0, 20, 300) },
    { id: "tiny", bounds: geometry(10, 10, 20, 20) },
    ...Array.from({ length: 100 }, (_, n) => ({
      id: `w${n}`,
      bounds: geometry(0, 0, 300, 300),
    })),
  ];
  const fitted = fitWindows(raw, display, identity);
  assert.ok(!fitted.some((w) => ["sliver", "tiny"].includes(w.id)));
  assert.equal(fitted.length, 64);
});

test("macOS windows: only normal layer windows that are drawn, front to back", () => {
  const json = JSON.stringify([
    {
      id: 5,
      pid: 1,
      owner: "Dock",
      name: "",
      layer: 20,
      alpha: 1,
      bounds: { X: 0, Y: 0, Width: 800, Height: 60 },
    },
    {
      id: 9,
      pid: 77,
      owner: "Google Chrome",
      name: "Inbox",
      layer: 0,
      alpha: 1,
      bounds: { X: 40, Y: 30, Width: 600, Height: 400 },
    },
    {
      id: 3,
      pid: 123,
      owner: "Blinkling",
      name: "",
      layer: 0,
      alpha: 1,
      bounds: { X: 0, Y: 0, Width: 800, Height: 600 },
    },
    {
      id: 4,
      pid: 88,
      owner: "Notes",
      name: "Todo",
      layer: 0,
      alpha: 0,
      bounds: { X: 0, Y: 0, Width: 300, Height: 300 },
    },
    {
      id: 2,
      pid: 99,
      owner: "Finder",
      name: "",
      layer: -2147483623,
      alpha: 1,
      bounds: { X: 0, Y: 0, Width: 800, Height: 600 },
    },
    {
      id: 1,
      pid: 66,
      owner: "Mail",
      name: "Inbox (3)",
      layer: 0,
      alpha: 1,
      bounds: { X: 100, Y: 100, Width: 500, Height: 300 },
    },
  ]);
  const found = parseMacWindows(json, { pids: new Set([123]) });
  assert.deepEqual(
    found.map((w) => [w.id, w.app, w.title, w.bounds]),
    [
      ["9", "Google Chrome", "Inbox", geometry(40, 30, 600, 400)],
      ["1", "Mail", "Inbox (3)", geometry(100, 100, 500, 300)],
    ],
  );
});

test("Windows windows parse from the script's JSON and tolerate junk", () => {
  const json = JSON.stringify([
    {
      id: 1001,
      pid: 7,
      app: "msedge",
      title: "News - Microsoft Edge",
      x: 10,
      y: 20,
      width: 900,
      height: 700,
    },
    {
      id: 1002,
      pid: 8,
      app: "notepad",
      title: "a.txt",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
    {
      id: 1003,
      pid: 9,
      app: "Blinkling",
      title: "",
      x: 0,
      y: 0,
      width: 300,
      height: 300,
    },
  ]);
  const found = parseWindowsWindows(json, { pids: new Set([9]) });
  assert.deepEqual(
    found.map((w) => [w.id, w.app, w.bounds]),
    [["1001", "msedge", geometry(10, 20, 900, 700)]],
  );
  assert.deepEqual(parseWindowsWindows("not json"), []);
  assert.deepEqual(parseWindowsWindows(""), []);
  assert.deepEqual(parseMacWindows("{}"), []);
});

test("the OS scripts only read window facts and never touch anything", () => {
  for (const script of [MAC_SCRIPT, WINDOWS_SCRIPT])
    assert.doesNotMatch(
      script,
      /SendKeys|keystroke|click|Invoke-WebRequest|curl|Set-ItemProperty|Remove-Item|rm -/i,
    );
  assert.match(MAC_SCRIPT, /CGWindowListCopyWindowInfo/);
  assert.match(WINDOWS_SCRIPT, /EnumWindows/);
});

test("listWindows asks the platform's source and fails to an empty list", async () => {
  const calls = [];
  const run = async (file) => {
    calls.push(file);
    return JSON.stringify([
      {
        id: 9,
        pid: 77,
        owner: "Notes",
        name: "x",
        layer: 0,
        alpha: 1,
        bounds: { X: 0, Y: 0, Width: 400, Height: 300 },
      },
    ]);
  };
  const mac = await listWindows({
    platform: "darwin",
    run,
    own: { pids: new Set() },
  });
  assert.equal(mac.length, 1);
  assert.deepEqual(calls, ["osascript"]);
  const broken = await listWindows({
    platform: "darwin",
    run: async () => {
      throw new Error("no osascript");
    },
    own: {},
  });
  assert.deepEqual(broken, []);
  assert.deepEqual(
    await listWindows({ platform: "freebsd", run, own: {} }),
    [],
  );
  const slow = await listWindows({
    platform: "darwin",
    run: () => new Promise(() => {}),
    own: {},
    timeout: 20,
  });
  assert.deepEqual(slow, []);
});
