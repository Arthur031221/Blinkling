import { test } from "node:test";
import assert from "node:assert/strict";
import { validateChoice, DRAG_THRESHOLD } from "./choice.mjs";

const capture = {
  region: { x: 0, y: 0, width: 800, height: 600 },
  pixelWidth: 1600,
  pixelHeight: 1200,
};
const windows = [
  {
    id: "w1",
    app: "Google Chrome",
    title: "Inbox",
    bounds: { x: 100, y: 50, width: 500, height: 400 },
  },
  {
    id: "w2",
    app: "Mousepad",
    title: "a.txt",
    bounds: { x: 0, y: 0, width: 300, height: 300 },
  },
];
const session = { capture, windows, companion: true };

test("the drag threshold is six pixels", () => {
  assert.equal(DRAG_THRESHOLD, 6);
});

test("an area inside the frozen frame is accepted as is", () => {
  const rect = { x: 10, y: 20, width: 100, height: 80 };
  assert.deepEqual(validateChoice({ kind: "area", rect }, session), {
    kind: "area",
    rect,
  });
});

test("an area outside the frame or with no size is refused", () => {
  for (const rect of [
    { x: -1, y: 0, width: 10, height: 10 },
    { x: 0, y: 0, width: 0, height: 10 },
    { x: 700, y: 0, width: 200, height: 10 },
    { x: 0, y: 0, width: Infinity, height: 10 },
    null,
  ])
    assert.throws(() => validateChoice({ kind: "area", rect }, session), {
      message: "Invalid capture region",
    });
});

test("a window is looked up in the list the main process made, never trusted from the page", () => {
  const taken = validateChoice(
    { kind: "window", id: "w2", bounds: { x: 0, y: 0, width: 9, height: 9 } },
    session,
  );
  assert.equal(taken.kind, "window");
  assert.deepEqual(taken.rect, windows[1].bounds);
  assert.equal(taken.window.id, "w2");
  assert.throws(() => validateChoice({ kind: "window", id: "nope" }, session), {
    message: "Invalid capture action",
  });
});

test("the whole screen needs nothing", () => {
  assert.deepEqual(validateChoice({ kind: "screen" }, session), {
    kind: "screen",
  });
});

test("the page needs a browser window and a connected companion", () => {
  const ok = validateChoice({ kind: "page", id: "w1" }, session);
  assert.equal(ok.kind, "page");
  assert.deepEqual(ok.rect, windows[0].bounds);
  for (const bad of [
    [{ kind: "page", id: "w2" }, session],
    [
      { kind: "page", id: "w1" },
      { ...session, companion: false },
    ],
    [{ kind: "page", id: "zzz" }, session],
  ])
    assert.throws(() => validateChoice(...bad), {
      message: "Invalid capture action",
    });
});

test("anything else is refused, including the old shift and region shapes", () => {
  for (const bad of [
    undefined,
    null,
    "screen",
    {},
    { kind: "region", rect: { x: 0, y: 0, width: 5, height: 5 } },
    { kind: "full-page" },
  ])
    assert.throws(() => validateChoice(bad, session), {
      message: "Invalid capture action",
    });
});
