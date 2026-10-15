import test from "node:test";
import assert from "node:assert/strict";
import { iou, snapRect, MIN_IOU } from "./snap.mjs";

const el = (id, kind, x, y, width, height, extra = {}) => ({
  id,
  kind,
  bounds: { x, y, width, height },
  ...extra,
});

test("iou is intersection over union", () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(iou(a, a), 1);
  assert.equal(iou(a, { x: 20, y: 0, width: 10, height: 10 }), 0);
  assert.equal(iou(a, { x: 5, y: 0, width: 10, height: 10 }), 50 / 150);
  assert.equal(iou(a, { x: 0, y: 0, width: 0, height: 0 }), 0);
});

test("the element with the greatest overlap wins", () => {
  const list = [
    el("page", "page", 0, 0, 1000, 800),
    el("p", "paragraph", 100, 100, 300, 60),
    el("img", "image", 100, 200, 300, 200),
  ];
  const out = snapRect({ x: 95, y: 195, width: 320, height: 215 }, list);
  assert.equal(out.element.id, "img");
  assert.deepEqual(out.rect, { x: 100, y: 200, width: 300, height: 200 });
});

test("kinds filters the candidates", () => {
  const list = [
    el("p", "paragraph", 100, 100, 300, 60),
    el("img", "image", 100, 100, 300, 70),
  ];
  const rect = { x: 100, y: 100, width: 300, height: 62 };
  assert.equal(snapRect(rect, list).element.id, "p");
  assert.equal(snapRect(rect, list, { kinds: ["image"] }).element.id, "img");
});

test("with nothing close enough the rect comes back unchanged", () => {
  const list = [el("p", "paragraph", 500, 500, 100, 100)];
  const rect = { x: 10, y: 10, width: 50, height: 20 };
  const out = snapRect(rect, list);
  assert.deepEqual(out, { rect, element: null });
  assert.ok(MIN_IOU >= 0.3);
});

test("a rect that only grazes an element does not snap", () => {
  const list = [el("p", "paragraph", 0, 0, 100, 100)];
  const rect = { x: 90, y: 90, width: 100, height: 100 };
  assert.equal(snapRect(rect, list).element, null);
});

test("with no elements the rect is unchanged", () => {
  const rect = { x: 1, y: 2, width: 3, height: 4 };
  assert.deepEqual(snapRect(rect, []), { rect, element: null });
});

test("secure markers are never a snap target", () => {
  const list = [
    el("pw", "input", 100, 100, 200, 30, { secure: true }),
    el("p", "paragraph", 100, 100, 200, 34),
  ];
  const out = snapRect({ x: 100, y: 100, width: 200, height: 30 }, list);
  assert.equal(out.element.id, "p");
  const only = snapRect({ x: 100, y: 100, width: 200, height: 30 }, [list[0]]);
  assert.equal(only.element, null);
});

// The same page at different scale factors: elements and the model's rect are
// both in screen DIP, so what snaps does not depend on the scale factor.
for (const scale of [1, 1.5, 2]) {
  test(`snaps the same at scale factor ${scale}`, () => {
    const css = (n) => n; // DIP, as the sources deliver them
    const native = (n) => Math.round(n * scale);
    const toDip = (n) => native(n) / scale;
    const list = [
      el("h", "heading", css(120), css(80), css(400), css(40)),
      el("p", "paragraph", css(120), css(130), css(400), css(90)),
    ];
    // a model box drawn on the native screenshot, converted by the caller
    const drawn = {
      x: toDip(124),
      y: toDip(128),
      width: toDip(396),
      height: toDip(96),
    };
    const out = snapRect(drawn, list);
    assert.equal(out.element.id, "p");
    assert.deepEqual(out.rect, list[1].bounds);
  });
}

test("snaps on a second display with negative and offset origins", () => {
  const left = el("l", "paragraph", -1500, 200, 400, 60);
  const right = el("r", "paragraph", 1930, 220, 400, 60);
  const list = [left, right];
  assert.equal(
    snapRect({ x: -1490, y: 205, width: 390, height: 50 }, list).element.id,
    "l",
  );
  assert.equal(
    snapRect({ x: 1935, y: 225, width: 390, height: 50 }, list).element.id,
    "r",
  );
});

test("a rect across two displays snaps to the larger overlap", () => {
  const a = el("a", "image", 1800, 100, 120, 200);
  const b = el("b", "image", 1920, 100, 400, 200);
  const out = snapRect({ x: 1850, y: 100, width: 400, height: 200 }, [a, b]);
  assert.equal(out.element.id, "b");
});
