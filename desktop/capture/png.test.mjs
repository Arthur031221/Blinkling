import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { encodePng, pngSize, createPngEncoder } from "./png.mjs";

/** A bitmap in BGRA order with a gradient, a hard edge and a block of noise. */
function bitmap(width, height) {
  const data = Buffer.alloc(width * height * 4);
  let seed = 7;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noisy = x > width / 2 && y > height / 2;
      data[i] = noisy ? seed & 255 : (x * 255) / width; // blue
      data[i + 1] = noisy ? (seed >> 8) & 255 : x < width / 3 ? 20 : 200; // green
      data[i + 2] = noisy ? (seed >> 16) & 255 : (y * 255) / height; // red
      data[i + 3] = 255;
    }
  return data;
}
const same = (png, source, width, height) => {
  const read = PNG.sync.read(png);
  assert.equal(read.width, width);
  assert.equal(read.height, height);
  for (let i = 0; i < width * height; i++) {
    assert.equal(read.data[i * 4], source[i * 4 + 2], `red ${i}`);
    assert.equal(read.data[i * 4 + 1], source[i * 4 + 1], `green ${i}`);
    assert.equal(read.data[i * 4 + 2], source[i * 4], `blue ${i}`);
    assert.equal(read.data[i * 4 + 3], 255);
  }
};

test("a BGRA bitmap becomes a PNG that decodes to the very same pixels", () => {
  const source = bitmap(97, 61);
  const png = encodePng(source, 97, 61);
  assert.deepEqual(pngSize(png), { width: 97, height: 61 });
  same(png, source, 97, 61);
  assert.throws(() => encodePng(source, 96, 61), /does not match/);
  assert.throws(() => encodePng(Buffer.alloc(0), 0, 0), /does not match/);
});

test("the encoder gives the same bytes on a worker thread as in place", async () => {
  const source = bitmap(120, 80);
  const encoder = createPngEncoder();
  try {
    const data = await encoder.encode({
      bitmap: source,
      width: 120,
      height: 80,
    });
    assert.equal(data, encodePng(source, 120, 80).toString("base64"));
    // The caller keeps its pixels: only a copy went to the worker.
    same(Buffer.from(data, "base64"), source, 120, 80);
    same(encodePng(source, 120, 80), source, 120, 80);
  } finally {
    encoder.dispose();
  }
});

test("a worker that cannot start or dies leaves the picture encoded in place", async () => {
  const source = bitmap(33, 21);
  const expected = encodePng(source, 33, 21).toString("base64");
  const none = createPngEncoder({
    create: () => {
      throw new Error("no threads here");
    },
  });
  assert.equal(
    await none.encode({ bitmap: source, width: 33, height: 21 }),
    expected,
  );
  const dying = createPngEncoder({
    create: () => {
      const handlers = {};
      return {
        on: (name, f) => (handlers[name] = f),
        postMessage: () => queueMicrotask(() => handlers.exit?.()),
      };
    },
  });
  assert.equal(
    await dying.encode({ bitmap: source, width: 33, height: 21 }),
    expected,
  );
});

test("compressing a very large screen leaves the main thread free to run its timers", async () => {
  const width = 5120,
    height = 2880;
  const source = bitmap(width, height);
  const encoder = createPngEncoder();
  let last = performance.now(),
    worst = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 5);
    last = now;
  }, 5);
  try {
    const began = performance.now();
    const data = await encoder.encode({ bitmap: source, width, height });
    const took = performance.now() - began;
    assert.deepEqual(pngSize(Buffer.from(data, "base64")), { width, height });
    // The copy for the thread is the only work left on this one.
    assert.ok(worst < 80, `the main thread stood still for ${worst} ms`);
    assert.ok(took > worst, "the work really happened elsewhere");
  } finally {
    clearInterval(timer);
    encoder.dispose();
  }
});
