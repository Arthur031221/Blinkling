import assert from "node:assert/strict";
import test from "node:test";
import { analyzeImage, createImageSource } from "./image.mjs";

const canvas = (width, height, shade = 255) => {
  const data = new Uint8ClampedArray(width * height * 4).fill(shade);
  return { width, height, data };
};
const fill = (img, x, y, w, h, color) => {
  const [r, g, b] = Array.isArray(color) ? color : [color, color, color];
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) {
      const o = (j * img.width + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
};
// A line of "text": short dark words with the gaps real words have.
const line = (
  img,
  x,
  y,
  words,
  height = 10,
  ink = 30,
  gap = 6,
  wordWidth = 36,
) => {
  for (let i = 0; i < words; i++)
    fill(img, x + i * (wordWidth + gap), y, wordWidth, height, ink);
};
// A photograph: a different shade at nearly every pixel.
const photo = (img, x, y, w, h) => {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      fill(img, x + i, y + j, 1, 1, [
        (i * 13 + j * 7) % 256,
        (i * 5 + j * 11) % 256,
        (i * 3 + j * 17) % 256,
      ]);
};
const kinds = (result, kind) => result.regions.filter((r) => r.kind === kind);
const inside = (inner, outer, slack = 4) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack;

test("a photograph is one image region", () => {
  const img = canvas(400, 300);
  photo(img, 100, 60, 160, 120);
  const result = analyzeImage(img, { scale: 1 });
  const [one, ...rest] = kinds(result, "image");
  assert.equal(rest.length, 0);
  assert.ok(inside(one, { x: 100, y: 60, width: 160, height: 120 }));
  assert.ok(one.width >= 150 && one.height >= 110);
});

test("words on a line merge into one text line, lines into a paragraph", () => {
  const img = canvas(500, 300);
  line(img, 40, 40, 6);
  line(img, 40, 58, 6);
  line(img, 40, 76, 4);
  line(img, 40, 200, 5); // far below: another paragraph
  const result = analyzeImage(img, { scale: 1 });
  assert.equal(kinds(result, "text").length, 4);
  const paragraphs = kinds(result, "paragraph");
  assert.equal(paragraphs.length, 2);
  const first = paragraphs.find((p) => p.y < 100);
  assert.ok(inside(first, { x: 40, y: 40, width: 250, height: 50 }));
  assert.ok(first.height >= 40);
  const lines = result.regions.filter(
    (r) => r.kind === "text" && r.parent !== null,
  );
  assert.equal(lines.length, 4);
});

test("a taller single line is a heading", () => {
  const img = canvas(500, 300);
  line(img, 40, 30, 3, 26, 30, 10, 60);
  line(img, 40, 90, 6);
  line(img, 40, 108, 6);
  const result = analyzeImage(img, { scale: 1 });
  const [heading] = kinds(result, "heading");
  assert.ok(heading && heading.y < 60);
  assert.equal(kinds(result, "paragraph").length, 1);
});

test("text inside a photograph is not read as lines", () => {
  const img = canvas(400, 300);
  photo(img, 50, 50, 200, 150);
  const result = analyzeImage(img, { scale: 1 });
  assert.equal(kinds(result, "text").length, 0);
  assert.equal(kinds(result, "image").length, 1);
});

test("a flat coloured block is not an image, and an empty page has nothing", () => {
  const img = canvas(300, 200);
  fill(img, 40, 40, 120, 60, [20, 90, 200]);
  assert.equal(kinds(analyzeImage(img, { scale: 1 }), "image").length, 0);
  assert.deepEqual(analyzeImage(canvas(300, 200), { scale: 1 }).regions, []);
});

test("light text on a dark page is found against the page's own background", () => {
  const img = canvas(400, 200, 20);
  line(img, 30, 40, 5, 10, 230);
  line(img, 30, 58, 5, 10, 230);
  const result = analyzeImage(img, { scale: 1 });
  assert.equal(kinds(result, "text").length, 2);
});

test("window borders and a hatched scroll bar do not swallow the text", () => {
  const img = canvas(420, 340);
  // The frame of a window and a scroll bar down its side, as drawn by a toolkit.
  fill(img, 0, 0, 420, 2, 40);
  fill(img, 0, 338, 420, 2, 40);
  fill(img, 0, 0, 2, 340, 40);
  fill(img, 418, 0, 2, 340, 40);
  fill(img, 396, 0, 2, 340, 40);
  for (let y = 0; y < 340; y += 2) fill(img, 399, y, 16, 1, 120);
  line(img, 30, 40, 5, 10);
  line(img, 60, 58, 8, 10); // runs up to the scroll bar
  line(img, 30, 76, 4, 10);
  const result = analyzeImage(img, { scale: 1 });
  assert.equal(kinds(result, "text").length, 3);
  const [paragraph] = kinds(result, "paragraph");
  assert.ok(inside(paragraph, { x: 30, y: 40, width: 360, height: 46 }));
});

test("a 2x capture gives the same layout in half the units when scaled back", () => {
  const img = canvas(1000, 600);
  line(img, 80, 80, 6, 20, 30, 12, 72);
  line(img, 80, 116, 6, 20, 30, 12, 72);
  const result = analyzeImage(img, { scale: 2 });
  const [paragraph] = kinds(result, "paragraph");
  assert.ok(paragraph.width > 400);
  assert.equal(kinds(result, "text").length, 2);
});

test("the source turns regions into DIP elements with no text, parents set", async () => {
  const img = canvas(500, 300);
  line(img, 40, 40, 6);
  line(img, 40, 58, 6);
  photo(img, 300, 150, 100, 100);
  const source = createImageSource({
    capture: async () => img,
  });
  const window = {
    id: "w1",
    title: "Doc",
    app: "evince",
    bounds: { x: 1000 + 10, y: 20, width: 500, height: 300 },
    private: false,
    passwordManager: false,
  };
  const display = {
    id: "2",
    scaleFactor: 1,
    bounds: { x: 1000, y: 0, width: 1920, height: 1080 },
  };
  const out = await source.read({
    window,
    display,
    point: { x: 1100, y: 100 },
  });
  const paragraph = out.elements.find((e) => e.kind === "paragraph");
  const image = out.elements.find((e) => e.kind === "image");
  assert.ok(paragraph && image);
  assert.equal(paragraph.text, "");
  assert.ok(paragraph.id.startsWith("image:w1:"));
  // window-relative pixels -> screen DIP on the second display
  assert.ok(paragraph.bounds.x >= 1010 && paragraph.bounds.x < 1060);
  assert.ok(image.bounds.x >= 1310 && image.bounds.y >= 170);
  const lineEl = out.elements.find((e) => e.kind === "text");
  assert.equal(out.parents.get(lineEl.id), paragraph.id);
});

test("no capture, a failing capture or an empty window falls through with null", async () => {
  const window = {
    id: "w1",
    title: "",
    app: "x",
    bounds: { x: 0, y: 0, width: 500, height: 300 },
    private: false,
    passwordManager: false,
  };
  const display = {
    id: "1",
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  };
  const ctx = { window, display, point: { x: 1, y: 1 } };
  assert.equal(await createImageSource({ capture: null }).read(ctx), null);
  assert.equal(
    await createImageSource({
      capture: async () => Promise.reject(new Error("no")),
    }).read(ctx),
    null,
  );
  assert.equal(
    await createImageSource({ capture: async () => canvas(500, 300) }).read(
      ctx,
    ),
    null,
  );
});
