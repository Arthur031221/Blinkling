import test from "node:test";
import assert from "node:assert/strict";
import { createZoom, MAX_SCALE } from "./zoom.mjs";

const make = (image = { width: 2000, height: 1000 }) =>
  createZoom({ view: { width: 1000, height: 800 }, image });

test("a picture opens fitted and centred, and a small one is not enlarged", () => {
  const big = make().state();
  assert.equal(big.scale, big.fit);
  assert.ok(big.fit < 1);
  assert.equal(big.x, (1000 - 2000 * big.scale) / 2);
  const small = make({ width: 100, height: 60 }).state();
  assert.equal(small.scale, 1);
  assert.equal(small.fit, 1);
});

test("the wheel zooms from the fit up to 800% and no further, around the pointer", () => {
  const z = make();
  const at = { x: 700, y: 300 };
  const before = z.state();
  const px = (at.x - before.x) / before.scale;
  z.wheel(at, -240);
  const after = z.state();
  assert.ok(after.scale > before.scale);
  assert.ok(Math.abs(after.x + px * after.scale - at.x) < 1e-6);
  for (let i = 0; i < 80; i++) z.wheel(at, -240);
  assert.equal(z.state().scale, MAX_SCALE);
  for (let i = 0; i < 200; i++) z.wheel(at, 240);
  assert.equal(z.state().scale, z.state().fit);
});

test("a pinch (ctrl wheel) zooms faster than a wheel notch", () => {
  const a = make(),
    b = make();
  a.wheel({ x: 500, y: 400 }, -20);
  b.wheel({ x: 500, y: 400 }, -20, { ctrl: true });
  assert.ok(b.state().scale > a.state().scale);
  const c = make();
  c.pinch({ x: 500, y: 400 }, 2);
  assert.ok(Math.abs(c.state().scale - c.state().fit * 2) < 1e-9);
});

test("dragging pans a zoomed picture but never past its edges", () => {
  const z = make();
  z.pinch({ x: 500, y: 400 }, 6);
  const s = z.state();
  z.pan(-100, -50);
  assert.equal(z.state().x, s.x - 100);
  z.pan(1e6, 1e6);
  assert.equal(z.state().x, 0);
  assert.equal(z.state().y, 0);
  z.pan(-1e6, -1e6);
  const end = z.state();
  assert.equal(end.x, 1000 - 2000 * end.scale);
  assert.equal(end.y, 800 - 1000 * end.scale);
});

test("a picture that is fitted cannot be dragged off its centre", () => {
  const z = make();
  const s = z.state();
  z.pan(300, 300);
  assert.deepEqual(z.state(), s);
});

test("a double click goes from the fit to 100% and back; a small picture goes to 200%", () => {
  const z = make();
  z.toggle({ x: 500, y: 400 });
  assert.equal(z.state().scale, 1);
  z.toggle({ x: 500, y: 400 });
  assert.equal(z.state().scale, z.state().fit);
  const small = make({ width: 100, height: 60 });
  small.toggle({ x: 500, y: 400 });
  assert.equal(small.state().scale, 2);
  small.toggle({ x: 500, y: 400 });
  assert.equal(small.state().scale, 1);
});

test("resizing keeps a fitted picture fitted and a zoomed one inside its limits", () => {
  const z = make();
  z.resize({ width: 500, height: 400 });
  assert.equal(z.state().scale, z.state().fit);
  z.pinch({ x: 100, y: 100 }, 4);
  z.resize({ width: 1200, height: 900 });
  const s = z.state();
  assert.ok(s.scale >= s.fit && s.scale <= MAX_SCALE);
});
