import test from "node:test";
import assert from "node:assert/strict";
import { cursorSource } from "./cursor.mjs";
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("X11 pointer query wins over a stale Electron point", async () => {
  let now = 0;
  const source = cursorSource({
    query: async () => ({ x: 300, y: 200 }),
    fallback: () => ({ x: 1255, y: 650 }),
    clock: () => now,
  });
  // Nothing has been answered yet: the fallback is the only truth.
  assert.deepEqual(source.point(), { x: 1255, y: 650 });
  await tick();
  assert.deepEqual(source.point(), { x: 300, y: 200 });
  now += 16;
  await tick();
  assert.deepEqual(source.point(), { x: 300, y: 200 });
});
test("physical pixels are converted to DIP", async () => {
  const source = cursorSource({
    query: async () => ({ x: 300, y: 150 }),
    fallback: () => ({ x: 0, y: 0 }),
    toDip: (p) => ({ x: p.x / 1.5, y: p.y / 1.5 }),
  });
  source.point();
  await tick();
  assert.deepEqual(source.point(), { x: 200, y: 100 });
});
test("failing or hung queries fall back to Electron and recover", async () => {
  let now = 0,
    mode = "fail",
    release;
  const source = cursorSource({
    query: () =>
      mode === "fail"
        ? Promise.reject(new Error("x11 closed"))
        : mode === "hang"
          ? new Promise((resolve) => (release = resolve))
          : Promise.resolve({ x: 5, y: 6 }),
    fallback: () => ({ x: 9, y: 9 }),
    clock: () => now,
    staleMs: 100,
  });
  source.point();
  await tick();
  assert.deepEqual(source.point(), { x: 9, y: 9 });
  await tick(); // let the query started by that read finish
  mode = "ok";
  source.point();
  await tick();
  assert.deepEqual(source.point(), { x: 5, y: 6 });
  await tick();
  // A hung reply must not freeze the last point forever.
  mode = "hang";
  now += 16;
  source.point();
  await tick();
  assert.deepEqual(source.point(), { x: 5, y: 6 });
  now += 500;
  assert.deepEqual(source.point(), { x: 9, y: 9 });
  release({ x: 1, y: 2 });
  await tick();
  assert.deepEqual(source.point(), { x: 1, y: 2 });
});
test("without a pointer query the Electron point is used unchanged", () => {
  const source = cursorSource({ fallback: () => ({ x: 4, y: 4 }) });
  assert.deepEqual(source.point(), { x: 4, y: 4 });
});
test("only one query is ever in flight", async () => {
  let calls = 0;
  const source = cursorSource({
    query: () => {
      calls++;
      return new Promise(() => {});
    },
    fallback: () => ({ x: 0, y: 0 }),
  });
  for (let i = 0; i < 20; i++) source.point();
  assert.equal(calls, 1);
});
test("the source reports where the point came from", async () => {
  let now = 0;
  const source = cursorSource({
    query: async () => ({ x: 1, y: 2 }),
    fallback: () => ({ x: 0, y: 0 }),
    clock: () => now,
    staleMs: 250,
  });
  assert.equal(source.source, "electron");
  source.point();
  await tick();
  assert.equal(source.source, "x11");
  now += 400;
  assert.equal(source.source, "electron");
});
test("the primary button state comes from the native query only", async () => {
  let button = false;
  const native = cursorSource({
    query: async () => ({ x: 1, y: 2, down: button }),
    fallback: () => ({ x: 0, y: 0 }),
  });
  assert.equal(native.pressed(), null, "unknown before the first answer");
  native.point();
  await tick();
  assert.equal(native.pressed(), false);
  button = true;
  native.point();
  await tick();
  assert.equal(native.pressed(), true);
  assert.deepEqual(native.point(), { x: 1, y: 2 });
  const plain = cursorSource({ fallback: () => ({ x: 0, y: 0 }) });
  plain.point();
  assert.equal(plain.pressed(), null);
});
