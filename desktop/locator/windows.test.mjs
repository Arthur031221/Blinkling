import assert from "node:assert/strict";
import test from "node:test";
import { createWindowIndex } from "./windows.mjs";

const displays = [
  { id: "1", scaleFactor: 2, bounds: { x: 0, y: 0, width: 1000, height: 800 } },
  {
    id: "2",
    scaleFactor: 1,
    bounds: { x: 1000, y: 0, width: 1000, height: 800 },
  },
];
// Native px: the first display is scale 2, so native x is twice the DIP x
// until the second display begins at native 2000.
const toDip = (p) => ({
  x: p.x < 2000 ? p.x / 2 : 1000 + (p.x - 2000),
  y: p.y / 2,
});
const win = (id, x, y, width, height, over = {}) => ({
  id,
  app: "gedit",
  appClass: "gedit",
  title: id,
  pid: 1,
  bounds: { x, y, width, height },
  ...over,
});
const indexOf = (native, over = {}) =>
  createWindowIndex({
    list: async () => native,
    displays: () => displays,
    toDip,
    ttl: 0,
    ...over,
  });

test("windows are in screen DIP, front to back, with their display", async () => {
  const index = indexOf([
    win("a", 200, 100, 400, 300),
    win("b", 2100, 50, 500, 400),
  ]);
  const all = await index.all();
  assert.deepEqual(
    all.map((w) => w.id),
    ["a", "b"],
  );
  assert.deepEqual(all[0].bounds, { x: 100, y: 50, width: 200, height: 150 });
  assert.deepEqual(all[1].bounds, { x: 1100, y: 25, width: 500, height: 200 });
  assert.equal(all[0].display.id, "1");
  assert.equal(all[0].display.scaleFactor, 2);
  assert.equal(all[1].display.id, "2");
});

test("windowAt returns the frontmost window under a point on any display", async () => {
  const index = indexOf([
    win("front", 200, 100, 400, 300),
    win("back", 0, 0, 1600, 1400),
    win("other", 2100, 50, 500, 400),
  ]);
  assert.equal((await index.windowAt({ x: 150, y: 100 }))?.id, "front");
  assert.equal((await index.windowAt({ x: 700, y: 600 }))?.id, "back");
  assert.equal((await index.windowAt({ x: 1200, y: 100 }))?.id, "other");
  assert.equal(await index.windowAt({ x: 1900, y: 790 }), null);
});

test("a window over two displays belongs to the one it mostly covers", async () => {
  const index = indexOf([win("wide", 1800, 100, 400, 400)]); // DIP 900..1200 x
  const [w] = await index.all();
  assert.deepEqual(w.bounds, { x: 900, y: 50, width: 300, height: 200 });
  assert.equal(w.display.id, "2");
  assert.equal((await index.windowAt({ x: 950, y: 100 }))?.id, "wide");
});

test("private and password manager windows are flagged from app and title", async () => {
  const index = indexOf([
    win("p", 0, 0, 400, 400, {
      app: "chrome",
      title: "New Tab - Google Chrome (Incognito)",
    }),
    win("k", 0, 0, 400, 400, { app: "keepassxc", title: "Vault" }),
    win("n", 0, 0, 400, 400),
  ]);
  const byId = Object.fromEntries((await index.all()).map((w) => [w.id, w]));
  assert.equal(byId.p.private, true);
  assert.equal(byId.p.passwordManager, false);
  assert.equal(byId.k.passwordManager, true);
  assert.equal(byId.n.private, false);
  assert.equal(byId.n.passwordManager, false);
});

test("slivers and windows off every display are dropped", async () => {
  const index = indexOf([
    win("sliver", 0, 0, 6, 400),
    win("off", 9000, 9000, 400, 400),
    win("ok", 0, 0, 400, 400),
  ]);
  assert.deepEqual(
    (await index.all()).map((w) => w.id),
    ["ok"],
  );
});

test("a failing list is an empty one, and the last good list survives", async () => {
  let fail = false;
  const index = createWindowIndex({
    list: async () => {
      if (fail) throw new Error("x11 gone");
      return [win("a", 0, 0, 400, 400)];
    },
    displays: () => displays,
    toDip,
    ttl: 0,
  });
  assert.equal((await index.all()).length, 1);
  fail = true;
  assert.equal((await index.all()).length, 1);
});

test("the list is reused inside the ttl and read again after invalidate", async () => {
  let calls = 0;
  let at = 0;
  const index = createWindowIndex({
    list: async () => {
      calls++;
      return [win("a", 0, 0, 400, 400)];
    },
    displays: () => displays,
    toDip,
    ttl: 200,
    now: () => at,
  });
  await index.all();
  at = 100;
  await index.all();
  assert.equal(calls, 1);
  index.invalidate();
  await index.all();
  assert.equal(calls, 2);
});

test("display lookup by point", () => {
  const index = indexOf([]);
  assert.equal(index.displayAt({ x: 1500, y: 10 }).id, "2");
  assert.equal(index.displayAt({ x: 5000, y: 10 }).id, "2");
});

test("a hover budget does not wait for a slow window list", async () => {
  const index = indexOf([], {
    list: () => new Promise((resolve) => setTimeout(() => resolve([]), 300)),
  });
  const started = Date.now();
  assert.equal(await index.windowAt({ x: 10, y: 10 }, { budget: 20 }), null);
  assert.ok(Date.now() - started < 150);
});
