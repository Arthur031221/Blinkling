import test from "node:test";
import assert from "node:assert/strict";
import { createCropper } from "./crop.mjs";

function fakeNative() {
  const log = { decoded: 0, crops: [], resizes: [] };
  const image = (w, h) => ({
    getSize: () => ({ width: w, height: h }),
    crop: (r) => (log.crops.push(r), image(r.width, r.height)),
    resize: (s) => (log.resizes.push(s), image(s.width, s.height)),
    toPNG: () => Buffer.from(`png-${w}x${h}`),
  });
  return { log, nativeImage: { createFromBuffer: () => (log.decoded++, image(2560, 1600)) } };
}
const capture = {
  region: { x: 0, y: 0, width: 1280, height: 800 },
  pixelWidth: 2560,
  pixelHeight: 1600,
  image: { data: Buffer.from("whole").toString("base64") },
};

test("a cut is taken in pixels at the screen's density and returned as PNG", () => {
  const { nativeImage, log } = fakeNative();
  const out = createCropper({ nativeImage })(capture, { x: 10, y: 20, width: 100, height: 50 });
  assert.deepEqual(log.crops[0], { x: 20, y: 40, width: 200, height: 100 });
  assert.equal(Buffer.from(out.data, "base64").toString(), "png-200x100");
  assert.deepEqual([out.width, out.height], [200, 100]);
});

test("the flight thumbnail is small, the attachment is not", () => {
  const { nativeImage, log } = fakeNative();
  const out = createCropper({ nativeImage })(capture, { x: 0, y: 0, width: 1000, height: 500 });
  assert.deepEqual(log.resizes[0], { width: 192, height: 96 });
  assert.match(out.dataUrl, /^data:image\/png;base64,/);
  assert.equal(Buffer.from(out.data, "base64").toString(), "png-2000x1000");
});

test("a small cut is not enlarged for the thumbnail", () => {
  const { nativeImage, log } = fakeNative();
  createCropper({ nativeImage })(capture, { x: 0, y: 0, width: 40, height: 20 });
  assert.equal(log.resizes.length, 0);
});

test("the screen grab is decoded once however many cuts are taken", () => {
  const { nativeImage, log } = fakeNative();
  const crop = createCropper({ nativeImage });
  crop(capture, { x: 0, y: 0, width: 10, height: 10 });
  crop(capture, { x: 20, y: 20, width: 10, height: 10 });
  assert.equal(log.decoded, 1);
});

test("a cut outside the screen is refused", () => {
  const { nativeImage } = fakeNative();
  assert.throws(() => createCropper({ nativeImage })(capture, { x: 1200, y: 0, width: 200, height: 10 }), /Invalid capture region/);
});
