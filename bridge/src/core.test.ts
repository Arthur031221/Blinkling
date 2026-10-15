import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { CaptureHistory } from "./history.js";
import { SlidingWindowLimiter } from "./limiter.js";
import { normalizePng } from "./png.js";

const pngFixture = (width: number, height: number) => {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 201;
    png.data[i + 1] = 50;
    png.data[i + 2] = 9;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
};

describe("PNG normalization", () => {
  it("validates pixels, scales to the requested long edge, and signs pixel data", () => {
    const first = normalizePng(pngFixture(8, 4), 4);
    const second = normalizePng(pngFixture(8, 4), 4);
    expect([first.width, first.height]).toEqual([4, 2]);
    expect(first.signature).toBe(second.signature);
    expect(normalizePng(pngFixture(2, 2)).signature).not.toBe(first.signature);
  });
  it("rejects non-PNG bytes and oversized dimensions before decode", () => {
    expect(() => normalizePng(Buffer.from("bad image"))).toThrow(/PNG/);
    const invalid = Buffer.alloc(33);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(invalid);
    invalid.writeUInt32BE(100_000, 16);
    invalid.writeUInt32BE(100_000, 20);
    expect(() => normalizePng(invalid)).toThrow(/pixel limit/);
  });
});

describe("bounded session state", () => {
  it("expires and bounds entries and notes, and clear removes both", () => {
    const history = new CaptureHistory(2, 100);
    const now = Date.now();
    const item = (at: number) => ({
      at,
      image: Buffer.alloc(1),
      width: 1,
      height: 1,
      source: "fixture",
      signature: "x",
      note: "",
    });
    history.add(item(now));
    history.add(item(now + 1));
    history.add(item(now + 2));
    expect(history.all()).toHaveLength(2);
    history.addNote("hello", "user");
    history.prune(now + 200);
    expect(history.latest()).toBeUndefined();
    expect(history.allNotes()).toHaveLength(0);
    history.add(item(now + 300));
    history.addNote("clear", "assistant");
    history.clear();
    expect(history.all()).toHaveLength(0);
    expect(history.allNotes()).toHaveLength(0);
  });
  it("caps retained watch frames over a rolling minute and releases capacity", () => {
    const limiter = new SlidingWindowLimiter(6, 60_000);
    for (let i = 0; i < 6; i++) expect(limiter.take(i * 1000)).toBe(true);
    expect(limiter.take(6000)).toBe(false);
    expect(limiter.take(60_000)).toBe(true);
  });
});
