import test from "node:test";
import assert from "node:assert/strict";
import { createImageSource, analyse, analyseAsync } from "./sources/image.mjs";

const win = {
  id: "w3",
  app: "x",
  title: "t",
  bounds: { x: 100, y: 50, width: 400, height: 300 },
};

// An RGBA canvas with a white background; helpers draw into it.
function canvas(width, height) {
  const data = new Uint8Array(width * height * 4).fill(255);
  const put = (x, y, r, g, b) => {
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  };
  return {
    width,
    height,
    data,
    scale: 1,
    // Short dark bars: what a line of text looks like at pixel level.
    textLine(x, y, length, h = 10) {
      for (let cx = x; cx < x + length; cx += 8)
        for (let dy = 0; dy < h; dy++)
          for (let dx = 0; dx < 5; dx++) put(cx + dx, y + dy, 20, 20, 20);
    },
    photo(x, y, w, h) {
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          put(
            x + dx,
            y + dy,
            (dx * 5) % 256,
            (dy * 7 + dx) % 256,
            (dx * dy) % 256,
          );
    },
  };
}

test("analyseAsync finds what analyse finds and lets timers run while it works", async () => {
  const c = canvas(1600, 1200);
  for (let row = 0; row < 12; row++) c.textLine(40, 40 + row * 18, 900);
  c.photo(1000, 300, 400, 300);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  const regions = await analyseAsync(c);
  clearInterval(timer);
  assert.deepEqual(regions, analyse(c));
  assert.ok(regions.some((r) => r.kind === "image"));
  assert.ok(ticks >= 3, `the event loop kept turning (${ticks} timer ticks)`);
});

test("an empty window has no regions", () => {
  assert.deepEqual(analyse(canvas(400, 300)), []);
});

test("lines of text group into a paragraph, a lone line stays text", () => {
  const c = canvas(400, 300);
  for (let row = 0; row < 3; row++) c.textLine(20, 20 + row * 18, 300);
  c.textLine(20, 200, 120);
  const regions = analyse(c);
  const paragraph = regions.find((r) => r.kind === "paragraph");
  assert.ok(paragraph, "a paragraph");
  assert.ok(
    paragraph.bounds.y <= 20 &&
      paragraph.bounds.y + paragraph.bounds.height >= 20 + 2 * 18 + 10,
  );
  assert.ok(paragraph.bounds.width >= 295);
  const line = regions.find((r) => r.kind === "text");
  assert.ok(line && line.bounds.y >= 195 && line.bounds.y <= 205);
});

test("a rich pixel block is an image", () => {
  const c = canvas(400, 300);
  c.photo(40, 40, 200, 150);
  const regions = analyse(c);
  const image = regions.find((r) => r.kind === "image");
  assert.ok(image);
  assert.ok(
    Math.abs(image.bounds.x - 40) <= 4 &&
      Math.abs(image.bounds.width - 200) <= 8,
  );
});

test("regions are returned in window DIP, scaled by the capture's pixels per DIP", async () => {
  const c = canvas(800, 600);
  c.scale = 2;
  c.photo(100, 100, 400, 300);
  const source = createImageSource({ capture: { image: async () => c } });
  const { elements } = await source.load(win, {});
  const image = elements.find((e) => e.kind === "image");
  assert.ok(Math.abs(image.bounds.x - (100 + 50)) <= 4);
  assert.ok(Math.abs(image.bounds.y - (50 + 50)) <= 4);
  assert.ok(Math.abs(image.bounds.width - 200) <= 8);
  assert.equal(image.parent, null);
});

test("without a capture function, or when capture fails, there is no answer", async () => {
  assert.equal(await createImageSource({ capture: {} }).load(win, {}), null);
  assert.equal(
    await createImageSource({
      capture: {
        image: async () => {
          throw new Error("denied");
        },
      },
    }).load(win, {}),
    null,
  );
  assert.equal(
    await createImageSource({
      capture: { image: async () => canvas(100, 100) },
    }).load(win, {}),
    null,
  );
});
