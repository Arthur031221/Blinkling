import test from "node:test";
import assert from "node:assert/strict";
import { alignToDevicePixels, displayAt, overlap, snapRect } from "./snap.mjs";

const display = (
  id,
  scaleFactor,
  x = 0,
  y = 0,
  width = 1920,
  height = 1080,
) => ({
  id,
  scaleFactor,
  bounds: { x, y, width, height },
});
const el = (id, kind, bounds) => ({ id, kind, bounds });

test("aligning rounds outward to whole device pixels at 1, 1.5 and 2", () => {
  assert.deepEqual(
    alignToDevicePixels({ x: 10.4, y: 20.6, width: 30.2, height: 9.1 }, 1),
    { x: 10, y: 20, width: 31, height: 10 },
  );
  // 1.5: device pixels are thirds of a DIP in steps of 2/3.
  const a = alignToDevicePixels(
    { x: 10.1, y: 20.1, width: 30, height: 10 },
    1.5,
  );
  for (const v of [a.x, a.y, a.x + a.width, a.y + a.height])
    assert.ok(
      Math.abs(v * 1.5 - Math.round(v * 1.5)) < 1e-9,
      `${v} is on the 1.5 grid`,
    );
  assert.ok(
    a.x <= 10.1 &&
      a.y <= 20.1 &&
      a.x + a.width >= 40.1 &&
      a.y + a.height >= 30.1,
  );
  const b = alignToDevicePixels(
    { x: 10.3, y: 5.2, width: 7.1, height: 3.3 },
    2,
  );
  for (const v of [b.x, b.y, b.x + b.width, b.y + b.height])
    assert.equal(v * 2, Math.round(v * 2));
  assert.deepEqual(b, { x: 10, y: 5, width: 7.5, height: 3.5 });
});

test("a rect already on the grid is not grown by float noise", () => {
  const r = { x: 50 / 1.5, y: 1 / 1.5, width: 100 / 1.5, height: 3 / 1.5 };
  const out = alignToDevicePixels(r, 1.5);
  for (const key of ["x", "y", "width", "height"])
    assert.ok(Math.abs(out[key] - r[key]) < 1e-9, key);
});

test("overlap is intersection over union", () => {
  assert.equal(
    overlap(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 10, height: 10 },
    ),
    1,
  );
  assert.equal(
    overlap(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 0, width: 10, height: 10 },
    ),
    0,
  );
  assert.equal(
    overlap(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 5, y: 0, width: 10, height: 10 },
    ),
    50 / 150,
  );
});

for (const scale of [1, 1.5, 2]) {
  test(`snapping lands on the element, on the ${scale}x pixel grid`, () => {
    const displays = [display(1, scale)];
    const elements = [
      el("a", "button", { x: 100.2, y: 100.2, width: 80, height: 30 }),
      el("b", "paragraph", { x: 100, y: 200, width: 600, height: 90 }),
    ];
    const out = snapRect(
      { x: 104, y: 98, width: 78, height: 34 },
      { elements, displays },
    );
    assert.equal(out.element.id, "a");
    for (const v of [
      out.rect.x,
      out.rect.y,
      out.rect.x + out.rect.width,
      out.rect.y + out.rect.height,
    ])
      assert.ok(Math.abs(v * scale - Math.round(v * scale)) < 1e-9);
    // The snapped rect covers the element.
    assert.ok(out.rect.x <= 100.2 && out.rect.x + out.rect.width >= 180.2);
    assert.ok(out.rect.y <= 100.2 && out.rect.y + out.rect.height >= 130.2);
  });
}

test("across displays the grid is the one of the display the element sits on", () => {
  const displays = [
    display(1, 1, 0, 0, 1920, 1080),
    display(2, 2, 1920, 0, 1280, 720),
  ];
  const elements = [
    el("far", "image", { x: 2000.3, y: 100.3, width: 200.2, height: 100.1 }),
  ];
  const out = snapRect(
    { x: 2005, y: 105, width: 190, height: 90 },
    { elements, displays },
  );
  assert.equal(out.element.id, "far");
  for (const v of [
    out.rect.x,
    out.rect.y,
    out.rect.x + out.rect.width,
    out.rect.y + out.rect.height,
  ])
    assert.equal(v * 2, Math.round(v * 2), "2x grid");
  assert.equal(displayAt(displays, { x: 2000, y: 100 }).id, 2);
  assert.equal(displayAt(displays, { x: 100, y: 100 }).id, 1);
});

test("an element that straddles two displays snaps on the display under its centre", () => {
  const displays = [
    display(1, 1, 0, 0, 1920, 1080),
    display(2, 2, 1920, 0, 1280, 720),
  ];
  const elements = [
    el("s", "section", { x: 1800.3, y: 10, width: 400, height: 100 }),
  ];
  const out = snapRect(
    { x: 1810, y: 12, width: 380, height: 96 },
    { elements, displays },
  );
  assert.equal(out.element.id, "s");
  // centre x is 2000.3, which is on display 2.
  assert.equal((out.rect.x * 2) % 1, 0);
});

test("with no element close enough the input rect comes back, aligned, with element null", () => {
  const displays = [display(1, 2)];
  const elements = [
    el("far", "paragraph", { x: 900, y: 900, width: 100, height: 20 }),
  ];
  const out = snapRect(
    { x: 10.1, y: 10.1, width: 50, height: 50 },
    { elements, displays },
  );
  assert.equal(out.element, null);
  assert.deepEqual(
    out.rect,
    alignToDevicePixels({ x: 10.1, y: 10.1, width: 50, height: 50 }, 2),
  );
  assert.deepEqual(
    snapRect(
      { x: 1, y: 2, width: 3, height: 4 },
      { elements: [], displays: [] },
    ),
    {
      rect: { x: 1, y: 2, width: 3, height: 4 },
      element: null,
    },
  );
});

test("a mark inside a small control snaps to it; inside a big paragraph it stays", () => {
  const displays = [display(1, 1)];
  const elements = [
    el("para", "paragraph", { x: 0, y: 0, width: 800, height: 400 }),
    el("btn", "button", { x: 100, y: 100, width: 60, height: 24 }),
  ];
  const onButton = snapRect(
    { x: 105, y: 102, width: 50, height: 20 },
    { elements, displays },
  );
  assert.equal(onButton.element.id, "btn");
  const inParagraph = snapRect(
    { x: 300, y: 200, width: 40, height: 14 },
    { elements, displays },
  );
  assert.equal(inParagraph.element, null);
});

test("kinds restricts the candidates and the default skips window and page", () => {
  const displays = [display(1, 1)];
  const elements = [
    el("page", "page", { x: 0, y: 0, width: 400, height: 300 }),
    el("img", "image", { x: 10, y: 10, width: 380, height: 280 }),
    el("txt", "paragraph", { x: 12, y: 12, width: 370, height: 270 }),
  ];
  const mark = { x: 0, y: 0, width: 400, height: 300 };
  assert.equal(snapRect(mark, { elements, displays }).element.id, "img");
  assert.equal(
    snapRect(mark, { elements, displays, kinds: ["paragraph"] }).element.id,
    "txt",
  );
  assert.equal(
    snapRect(mark, { elements, displays, kinds: ["page"] }).element.id,
    "page",
  );
  assert.equal(
    snapRect(mark, { elements, displays, kinds: ["table"] }).element,
    null,
  );
});

test("equal overlap prefers the more specific kind over a section", () => {
  const displays = [display(1, 1)];
  const elements = [
    el("wrap", "section", { x: 0, y: 0, width: 100, height: 100 }),
    el("txt", "paragraph", { x: 0, y: 0, width: 100, height: 100 }),
  ];
  assert.equal(
    snapRect({ x: 0, y: 0, width: 100, height: 100 }, { elements, displays })
      .element.id,
    "txt",
  );
});

test("bad input never throws", () => {
  assert.deepEqual(
    snapRect(
      { x: NaN, y: 0, width: 1, height: 1 },
      { elements: [], displays: [] },
    ).element,
    null,
  );
  assert.equal(
    snapRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { elements: [{ id: "x", kind: "image" }], displays: [] },
    ).element,
    null,
  );
});
