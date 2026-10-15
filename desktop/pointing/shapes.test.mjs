import "../shared/test-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { markKind, markShape, seedOf, KINDS } from "./shapes.mjs";

const rect = { x: 100, y: 200, width: 240, height: 40 };
const numbers = (d) =>
  [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

test("each kind of element gets the mark the spec names", () => {
  assert.equal(markKind({ kind: "text" }), "underline");
  for (const kind of ["control", "link", "button"])
    assert.equal(markKind({ kind }), "circle");
  for (const kind of ["image", "figure"])
    assert.equal(markKind({ kind }), "outline");
  for (const kind of ["table", "cell"]) assert.equal(markKind({ kind }), "box");
  assert.equal(markKind({ kind: "code" }), "outline");
  assert.equal(markKind(undefined), "outline");
});

test("the same seed draws the same mark, another seed a different one", () => {
  for (const kind of KINDS) {
    const a = markShape(kind, rect, { seed: 7 });
    assert.deepEqual(markShape(kind, rect, { seed: 7 }), a);
    assert.notDeepEqual(markShape(kind, rect, { seed: 8 }).paths, a.paths);
  }
  assert.notEqual(seedOf("uia:1:1"), seedOf("uia:1:2"));
});

test("every mark stays near its element and its bounds hold the stroke", () => {
  for (const kind of KINDS) {
    const { paths, bounds } = markShape(kind, rect, { seed: 3 });
    const xs = [],
      ys = [];
    for (const d of paths) {
      const n = numbers(d.replace(/[A-Za-z]/g, " "));
      for (let i = 0; i < n.length; i += 2) {
        xs.push(n[i]);
        ys.push(n[i + 1]);
      }
    }
    assert.ok(xs.length > 4, kind);
    assert.ok(
      Math.min(...xs) >= rect.x - 40 &&
        Math.max(...xs) <= rect.x + rect.width + 40,
      kind,
    );
    assert.ok(
      Math.min(...ys) >= rect.y - 40 &&
        Math.max(...ys) <= rect.y + rect.height + 40,
      kind,
    );
    assert.ok(bounds.x <= Math.min(...xs) + 0.5, kind);
    assert.ok(bounds.x + bounds.width >= Math.max(...xs) - 0.5, kind);
    assert.ok(bounds.y <= Math.min(...ys) + 0.5, kind);
    assert.ok(bounds.y + bounds.height >= Math.max(...ys) - 0.5, kind);
  }
});

test("an underline is one stroke per text line, under the line", () => {
  const lines = [
    { x: 100, y: 200, width: 240, height: 20 },
    { x: 100, y: 220, width: 120, height: 20 },
  ];
  const { paths, fill } = markShape("underline", rect, { lines });
  assert.equal(paths.length, 2);
  assert.equal(fill, false);
  const ys = paths.map((d) =>
    numbers(d.replace(/[A-Za-z]/g, " ")).filter((_, i) => i % 2),
  );
  assert.ok(ys[0].every((y) => y > 220 && y < 228));
  assert.ok(ys[1].every((y) => y > 240 && y < 248));
});

test("only a table cell's box is filled; a circle overshoots its start", () => {
  assert.equal(markShape("box", rect).fill, true);
  assert.equal(markShape("outline", rect).fill, false);
  assert.equal(markShape("circle", rect).paths.length, 1);
  assert.ok(!markShape("circle", rect).paths[0].endsWith("Z"));
  assert.ok(markShape("outline", rect).paths[0].endsWith("Z"));
});
