import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { textBands, bandRects } from "./lines.mjs";

/** RGBA bitmap with rows of ink at the given [top, height] spans. */
function bitmap(
  width,
  height,
  spans,
  { bg = [255, 255, 255], ink = [20, 20, 20], noise = 0 } = {},
) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inSpan = spans.some(([top, h]) => y >= top && y < top + h);
      // Text only covers part of a row: every third pixel, like glyph strokes.
      const color = inSpan && x % 3 === 0 && x > 4 && x < width - 4 ? ink : bg;
      const o = (y * width + x) * 4;
      const jitter = noise ? (x * 7 + y * 13) % noise : 0;
      data[o] = Math.min(255, color[0] + jitter);
      data[o + 1] = Math.min(255, color[1] + jitter);
      data[o + 2] = Math.min(255, color[2] + jitter);
      data[o + 3] = 255;
    }
  return { data, width, height };
}

test("three lines of dark text on white give three bands", () => {
  const bands = textBands(
    bitmap(200, 90, [
      [10, 12],
      [38, 12],
      [66, 12],
    ]),
  );
  assert.equal(bands.length, 3);
  assert.deepEqual(
    bands.map((b) => [b.top, b.height]),
    [
      [10, 12],
      [38, 12],
      [66, 12],
    ],
  );
});

test("light text on a dark background works the same", () => {
  const bands = textBands(
    bitmap(
      200,
      60,
      [
        [8, 14],
        [36, 14],
      ],
      { bg: [12, 14, 13], ink: [240, 240, 235] },
    ),
  );
  assert.equal(bands.length, 2);
});

test("small gaps inside a line (descenders, accents) do not split it", () => {
  const bands = textBands(
    bitmap(200, 40, [
      [5, 8],
      [15, 8],
    ]),
  );
  assert.equal(bands.length, 1);
  assert.deepEqual([bands[0].top, bands[0].height], [5, 18]);
});

test("a flat region without text has no bands", () => {
  assert.deepEqual(textBands(bitmap(100, 100, [])), []);
});

test("mild background noise is not text", () => {
  assert.deepEqual(textBands(bitmap(100, 100, [], { noise: 9 })), []);
});

test("bands become DIP rects inside the picked bounds at any pixel scale", () => {
  const bands = textBands(
    bitmap(400, 120, [
      [20, 24],
      [80, 24],
    ]),
  );
  const rects = bandRects(
    bands,
    { width: 400, height: 120 },
    { x: 100, y: 50, width: 200, height: 60 },
  );
  assert.equal(rects.length, 2);
  for (const [i, y] of [60, 90].entries()) {
    assert.equal(rects[i].y, y);
    assert.equal(rects[i].height, 12);
    // The ink runs from pixel 6 to 393 of 400: the stroke follows the text, not the box.
    assert.ok(rects[i].x >= 100 && rects[i].x <= 104, `x ${rects[i].x}`);
    assert.ok(
      rects[i].width >= 188 && rects[i].width <= 200,
      `w ${rects[i].width}`,
    );
  }
});

test("a short last line gets a short stroke", () => {
  const b = bitmap(400, 60, [
    [10, 12],
    [36, 12],
  ]);
  // Blank out the right part of the second line.
  for (let y = 36; y < 48; y++)
    for (let x = 200; x < 400; x++)
      b.data.set([255, 255, 255, 255], (y * 400 + x) * 4);
  const rects = bandRects(textBands(b), b, {
    x: 0,
    y: 0,
    width: 400,
    height: 60,
  });
  assert.ok(rects[0].width > 380);
  assert.ok(rects[1].width < 210, `w ${rects[1].width}`);
});
